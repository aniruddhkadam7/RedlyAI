import type { Request, Response } from 'express';

import { evaluateArchitectureAssurance, type ArchitectureAssuranceReport } from '../backend/assurance/ArchitectureAssurance';
import { ENTERPRISE_ASSURANCE_POLICY } from '../backend/assurance/AssurancePolicy';
import { getRepository } from '../backend/repository/RepositoryStore';
import { getRelationshipRepository } from '../backend/repository/RelationshipRepositoryStore';
import { getViewRepository } from '../backend/views/ViewRepositoryStore';
import type { ViewDefinition } from '../backend/views/ViewDefinition';

export default {
  'GET /api/repository/assurance': (req: Request, res: Response) => {
    const STALE_MS = 15000;
    const now = Date.now();

    if (req.query?.refresh === 'true') {
      scheduleAssuranceRefresh();
    }

    if (!assuranceCache || now - assuranceCache.computedAt > STALE_MS) {
      scheduleAssuranceRefresh();
    }

    res.send({
      success: true,
      data: assuranceCache?.report ?? buildEmptyAssuranceReport(),
      meta: { pending: computingAssurance, stale: !assuranceCache },
    });
  },
};

type AssuranceCache = { report: ArchitectureAssuranceReport; computedAt: number };

let assuranceCache: AssuranceCache | null = null;
let computingAssurance = false;

const buildEmptyAssuranceReport = (): ArchitectureAssuranceReport => {
  const observedAt = new Date().toISOString();
  const policy = ENTERPRISE_ASSURANCE_POLICY;
  return {
    observedAt,
    policy,
    findings: [],
    enforcement: {
      compliant: true,
      blockingSeverities: policy.failOnSeverities,
      blockingCount: 0,
    },
    summary: {
      total: 0,
      bySeverity: { Info: 0, Warning: 0, Error: 0 },
      byDomain: {
        RepositoryValidation: 0,
        RelationshipValidation: 0,
        IntegrityAudit: 0,
        ViewGovernance: 0,
      },
    },
  };
};

const scheduleAssuranceRefresh = () => {
  if (computingAssurance) return;
  computingAssurance = true;
  setImmediate(() => {
    try {
      const elements = getRepository();
      const relationships = getRelationshipRepository();

      let views: ViewDefinition[] = [];
      try {
        views = getViewRepository().listAllViews();
      } catch {
        views = [];
      }

      const report = evaluateArchitectureAssurance({
        elements,
        relationships,
        views,
      });

      assuranceCache = { report, computedAt: Date.now() };
    } catch {
      // Keep last cached report if refresh fails.
    } finally {
      computingAssurance = false;
    }
  });
};
