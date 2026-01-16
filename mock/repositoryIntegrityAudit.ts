import type { Request, Response } from 'express';

import { auditRepositoryIntegrity, type RepositoryIntegrityReport } from '../backend/analysis/RepositoryIntegrityAudit';
import { getRepository } from '../backend/repository/RepositoryStore';
import { getRelationshipRepository } from '../backend/repository/RelationshipRepositoryStore';

export default {
  'GET /api/repository/integrity-audit': (req: Request, res: Response) => {
    if (req.query?.refresh === 'true') scheduleIntegrityRefresh();
    if (!integrityCache) scheduleIntegrityRefresh();
    res.send({
      success: true,
      data: integrityCache?.report ?? emptyIntegrityReport(),
      meta: { pending: computingIntegrity, stale: !integrityCache },
    });
  },
};

type IntegrityCache = { report: RepositoryIntegrityReport; computedAt: number };

let integrityCache: IntegrityCache | null = null;
let computingIntegrity = false;

const emptyIntegrityReport = (): RepositoryIntegrityReport => ({
  observedAt: new Date().toISOString(),
  findings: [],
  summary: {
    total: 0,
    bySeverity: { Info: 0, Warning: 0, Error: 0 },
  },
});

const scheduleIntegrityRefresh = () => {
  if (computingIntegrity) return;
  computingIntegrity = true;
  setImmediate(() => {
    try {
      const elements = getRepository();
      const relationships = getRelationshipRepository();
      const report = auditRepositoryIntegrity(elements, relationships);
      integrityCache = { report, computedAt: Date.now() };
    } catch {
      // Keep last cached report if refresh fails.
    } finally {
      computingIntegrity = false;
    }
  });
};
