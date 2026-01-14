import type { Request, Response } from 'express';
import crypto from 'crypto';

import type { ImpactAnalysisDirection, ImpactAnalysisRequest } from '../backend/analysis/ImpactAnalysisRequest';
import { composeImpactAnalysisResponse } from '../backend/analysis/ImpactAnalysisApiComposer';
import { asyncImpactAnalysisJobManager } from '../backend/analysis/AsyncImpactAnalysisJobManager';
import { impactAnalysisEngine } from '../backend/analysis/ImpactAnalysisEngine';
import { impactExplanation } from '../backend/analysis/ImpactExplanation';
import { impactAuditTrail } from '../backend/analysis/ImpactAuditTrail';
import type { ImpactAnalysisAuditRecord } from '../backend/analysis/ImpactAudit';
import { getRepository } from '../backend/repository/RepositoryStore';
import { getRelationshipRepository } from '../backend/repository/RelationshipRepositoryStore';
import { DomainError } from '../backend/reliability/DomainError';
import { mapErrorToApiResponse } from '../backend/reliability/FailureHandling';

const normalizeId = (value: string) => (value ?? '').trim();

const asBoolean = (value: unknown): boolean => {
  if (value === true) return true;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }
  return false;
};

const asInt = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
};

const asDirection = (value: unknown, fallback: ImpactAnalysisDirection): ImpactAnalysisDirection => {
  if (value === 'Downstream' || value === 'Upstream' || value === 'Bidirectional') return value;
  if (typeof value === 'string') {
    const v = value.trim();
    if (v === 'Downstream' || v === 'Upstream' || v === 'Bidirectional') return v;
  }
  return fallback;
};

const stableRequestId = (basis: string): string => crypto.createHash('sha1').update(basis).digest('hex');

const allRelationshipTypesInRepo = (): string[] => {
  const repo = getRelationshipRepository();
  const types = new Set<string>();
  for (const r of repo.getAllRelationships()) {
    const t = (r.relationshipType ?? '').trim();
    if (t) types.add(t);
  }
  return Array.from(types).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
};

export default {
  'POST /api/impact/analyze': async (req: Request, res: Response) => {
    try {
      const includePaths = asBoolean((req.query as any)?.includePaths);
      const timeoutMsRaw = asInt((req.query as any)?.timeoutMs, 0);
      const timeoutMs = timeoutMsRaw > 0 ? timeoutMsRaw : undefined;

      const request = (req.body ?? {}) as ImpactAnalysisRequest;

      // Pure computation (no caching, no persistence of results).
      const data = await composeImpactAnalysisResponse(request, { includePaths, timeoutMs });
      res.send({ success: true, data });
    } catch (err) {
      const mapped = mapErrorToApiResponse(err, { operation: 'impact.analyze' });
      res.status(mapped.status).send(mapped.body);
    }
  },

  // Asynchronous impact analysis execution.
  // Explicit trigger only:
  // 1) Create job (Pending)
  // 2) Start job (Running)
  // 3) Poll status
  // 4) Fetch result
  // 5) Abort if needed
  'POST /api/impact/async/jobs': (req: Request, res: Response) => {
    try {
      const includePaths = asBoolean((req.query as any)?.includePaths);
      const timeoutMsRaw = asInt((req.query as any)?.timeoutMs, 0);
      const timeoutMs = timeoutMsRaw > 0 ? timeoutMsRaw : undefined;
      const request = (req.body ?? {}) as ImpactAnalysisRequest;

      const job = asyncImpactAnalysisJobManager.createJob({ request, options: { includePaths, timeoutMs } });
      res.send({ success: true, data: job });
    } catch (err) {
      const mapped = mapErrorToApiResponse(err, { operation: 'impact.async.createJob' });
      res.status(mapped.status).send(mapped.body);
    }
  },

  'POST /api/impact/async/jobs/:jobId/start': (req: Request, res: Response) => {
    try {
      const jobId = normalizeId((req.params as any)?.jobId);
      if (!jobId) {
        throw new DomainError({ code: 'VALIDATION_ERROR', message: 'jobId is required.', retryable: false });
      }

      const started = asyncImpactAnalysisJobManager.startJob(jobId);
      if (!started.ok) {
        const msg = started.errorMessage ?? 'Unable to start job.';
        if (msg.includes('Too many running jobs')) {
          throw new DomainError({ code: 'CONCURRENCY_LIMIT', message: msg, retryable: true });
        }
        if (msg.includes('not found')) {
          throw new DomainError({ code: 'NOT_FOUND', message: msg, retryable: false });
        }
        throw new DomainError({ code: 'UNKNOWN_ERROR', message: msg, retryable: false });
      }

      res.send({ success: true, data: started.job });
    } catch (err) {
      const mapped = mapErrorToApiResponse(err, { operation: 'impact.async.startJob' });
      res.status(mapped.status).send(mapped.body);
    }
  },

  'GET /api/impact/async/jobs/:jobId': (req: Request, res: Response) => {
    try {
      const jobId = normalizeId((req.params as any)?.jobId);
      const job = asyncImpactAnalysisJobManager.getJob(jobId);
      if (!job) throw new DomainError({ code: 'NOT_FOUND', message: 'Job not found.', retryable: false });
      res.send({ success: true, data: job });
    } catch (err) {
      const mapped = mapErrorToApiResponse(err, { operation: 'impact.async.getJob' });
      res.status(mapped.status).send(mapped.body);
    }
  },

  'GET /api/impact/async/jobs/:jobId/result': (req: Request, res: Response) => {
    try {
      const jobId = normalizeId((req.params as any)?.jobId);
      const payload = asyncImpactAnalysisJobManager.getJobResult(jobId);
      if (!payload) throw new DomainError({ code: 'NOT_FOUND', message: 'Job not found.', retryable: false });

      if (payload.status !== 'Completed' && payload.status !== 'Aborted') {
        res.status(409).send({ success: false, errorMessage: `Job is not finished (status=${payload.status}).` });
        return;
      }

      if (!payload.result) {
        // Preserve backward compatible shape; include structured error if present.
        res.status(409).send({
          success: false,
          errorMessage: payload.errorMessage ?? 'No result available for this job.',
          ...(payload.errorCode
            ? { error: { errorId: '', code: payload.errorCode, message: payload.errorMessage ?? '', retryable: false } }
            : {}),
        });
        return;
      }

      res.send({ success: true, data: payload.result });
    } catch (err) {
      const mapped = mapErrorToApiResponse(err, { operation: 'impact.async.getJobResult' });
      res.status(mapped.status).send(mapped.body);
    }
  },

  'POST /api/impact/async/jobs/:jobId/abort': (req: Request, res: Response) => {
    try {
      const jobId = normalizeId((req.params as any)?.jobId);
      if (!jobId) {
        throw new DomainError({ code: 'VALIDATION_ERROR', message: 'jobId is required.', retryable: false });
      }

      const aborted = asyncImpactAnalysisJobManager.abortJob(jobId);
      if (!aborted.ok) {
        throw new DomainError({ code: 'NOT_FOUND', message: aborted.errorMessage ?? 'Job not found.', retryable: false });
      }
      res.send({ success: true, data: aborted.job });
    } catch (err) {
      const mapped = mapErrorToApiResponse(err, { operation: 'impact.async.abortJob' });
      res.status(mapped.status).send(mapped.body);
    }
  },

  'GET /api/impact/audit': (req: Request, res: Response) => {
    try {
      const limit = asInt((req.query as any)?.limit, 50);
      const records = impactAuditTrail.listRecent(limit);
      res.send({ success: true, data: records });
    } catch (err) {
      const mapped = mapErrorToApiResponse(err, { operation: 'impact.audit.list' });
      res.status(mapped.status).send(mapped.body);
    }
  },

  'GET /api/impact/audit/:auditId': (req: Request, res: Response) => {
    try {
      const auditId = normalizeId((req.params as any)?.auditId);
      const record = impactAuditTrail.getByAuditId(auditId);
      if (!record) throw new DomainError({ code: 'NOT_FOUND', message: 'Audit record not found.', retryable: false });
      res.send({ success: true, data: record });
    } catch (err) {
      const mapped = mapErrorToApiResponse(err, { operation: 'impact.audit.get' });
      res.status(mapped.status).send(mapped.body);
    }
  },

  'GET /api/impact/explanation/:rootId/:elementId': async (req: Request, res: Response) => {
    try {
      const rootId = normalizeId((req.params as any)?.rootId);
      const elementId = normalizeId((req.params as any)?.elementId);

      if (!rootId || !elementId) {
        throw new DomainError({
          code: 'VALIDATION_ERROR',
          message: 'rootId and elementId are required.',
          retryable: false,
        });
      }

    // Stateless: compute a fresh path set for this root.
    // The endpoint supports optional query overrides, but remains deterministic.
    const direction = asDirection((req.query as any)?.direction, 'Downstream');
    const maxDepth = asInt((req.query as any)?.maxDepth, 6);

    const relationshipTypesRaw = (req.query as any)?.relationshipTypes;
    const includedRelationshipTypes =
      typeof relationshipTypesRaw === 'string' && relationshipTypesRaw.trim().length > 0
        ? relationshipTypesRaw
            .split(',')
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0)
            .sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0))
        : allRelationshipTypesInRepo();

    const repo = getRepository();
    const root = repo.getElementById(rootId);

    const syntheticRequest: ImpactAnalysisRequest = {
      requestId: stableRequestId(`explain|${rootId}|${direction}|${maxDepth}|${includedRelationshipTypes.join(',')}`),
      projectId: '',
      requestedBy: 'system',
      requestedAt: new Date().toISOString(),

      rootElementId: rootId,
      rootElementType: root?.elementType ?? 'Unknown',
      direction,
      maxDepth,

      includedElementTypes: [],
      includedRelationshipTypes,

      analysisIntent: 'Change',
    };

      const timeoutMsRaw = asInt((req.query as any)?.timeoutMs, 0);
      const timeoutMs = timeoutMsRaw > 0 ? timeoutMsRaw : undefined;

      const analysis = await impactAnalysisEngine.analyze(syntheticRequest, { includePaths: true, timeoutMs });
    const paths = analysis.paths ?? [];
    const explanation = impactExplanation.explain({
      rootElementId: rootId,
      impactedElementId: elementId,
      paths,
    });

    if (!explanation.ok) {
      res.status(404).send({ success: false, errorMessage: explanation.error });
      return;
    }

    res.send({ success: true, data: { ...explanation, warnings: analysis.warnings, analysisStats: analysis.stats } });
    } catch (err) {
      const mapped = mapErrorToApiResponse(err, { operation: 'impact.explanation' });
      res.status(mapped.status).send(mapped.body);
    }
  },

  'POST /api/impact/tree': async (req: Request, res: Response) => {
    try {
      const { rootElementId, direction, maxDepth } = (req.body ?? {}) as {
        rootElementId?: string;
        direction?: ImpactAnalysisDirection;
        maxDepth?: number;
      };

      const tree = await impactAnalysisEngine.buildLayeredImpactTree({
        rootElementId: normalizeId(rootElementId ?? ''),
        direction: direction === 'Upstream' ? 'Upstream' : direction === 'Bidirectional' ? 'Bidirectional' : 'Downstream',
        maxDepth: typeof maxDepth === 'number' && maxDepth > 0 ? Math.trunc(maxDepth) : 6,
      });

      res.send({ success: true, data: tree });
    } catch (err) {
      const mapped = mapErrorToApiResponse(err, { operation: 'impact.tree' });
      res.status(mapped.status).send(mapped.body);
    }
  },
};
