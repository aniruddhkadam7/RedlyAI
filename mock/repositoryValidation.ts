import type { Request, Response } from 'express';

import { validateArchitectureRepository, type RepositoryValidationReport } from '../backend/analysis/RepositoryValidation';
import { validateRelationshipRepository, type RelationshipValidationReport } from '../backend/analysis/RelationshipValidation';
import { getRepository } from '../backend/repository/RepositoryStore';
import { getRelationshipRepository } from '../backend/repository/RelationshipRepositoryStore';
import { summarizeRepositoryHealth, type RepositoryHealthSummary } from '../backend/validation/RepositoryHealth';

export default {
  'GET /api/repository/validation': (req: Request, res: Response) => {
    if (req.query?.refresh === 'true') scheduleValidationRefresh();
    if (!validationCache) scheduleValidationRefresh();
    res.send({
      success: true,
      data: validationCache?.report ?? emptyRepositoryValidation(),
      meta: { pending: computingValidation, stale: !validationCache },
    });
  },

  'GET /api/repository/relationship-validation': (req: Request, res: Response) => {
    if (req.query?.refresh === 'true') scheduleRelationshipValidationRefresh();
    if (!relationshipValidationCache) scheduleRelationshipValidationRefresh();
    res.send({
      success: true,
      data: relationshipValidationCache?.report ?? emptyRelationshipValidation(),
      meta: { pending: computingRelationshipValidation, stale: !relationshipValidationCache },
    });
  },

  'GET /api/repository/health-summary': (req: Request, res: Response) => {
    if (req.query?.refresh === 'true') scheduleHealthSummaryRefresh();
    if (!healthSummaryCache) scheduleHealthSummaryRefresh();
    res.send({
      success: true,
      data: healthSummaryCache?.summary ?? emptyHealthSummary(),
      meta: { pending: computingHealthSummary, stale: !healthSummaryCache },
    });
  },
};

type ValidationCache<T> = { report: T; computedAt: number };

let validationCache: ValidationCache<RepositoryValidationReport> | null = null;
let relationshipValidationCache: ValidationCache<RelationshipValidationReport> | null = null;
let healthSummaryCache: { summary: RepositoryHealthSummary; computedAt: number } | null = null;

let computingValidation = false;
let computingRelationshipValidation = false;
let computingHealthSummary = false;

const emptyRepositoryValidation = (): RepositoryValidationReport => ({
  observedAt: new Date().toISOString(),
  findings: [],
  summary: {
    total: 0,
    bySeverity: { Info: 0, Warning: 0, Error: 0 },
    byCheckId: {},
  },
});

const emptyRelationshipValidation = (): RelationshipValidationReport => ({
  observedAt: new Date().toISOString(),
  findings: [],
  summary: {
    total: 0,
    bySeverity: { Info: 0, Warning: 0, Error: 0 },
    byCheckId: {},
  },
});

const emptyHealthSummary = (): RepositoryHealthSummary => ({
  observedAt: new Date().toISOString(),
  total: 0,
  elementsAffected: 0,
  bySeverity: { Info: 0, Warning: 0, Error: 0 },
  findings: [],
});

const scheduleValidationRefresh = () => {
  if (computingValidation) return;
  computingValidation = true;
  setImmediate(() => {
    try {
      const repo = getRepository();
      const report = validateArchitectureRepository(repo);
      validationCache = { report, computedAt: Date.now() };
    } catch {
      // Keep last cached report if refresh fails.
    } finally {
      computingValidation = false;
    }
  });
};

const scheduleRelationshipValidationRefresh = () => {
  if (computingRelationshipValidation) return;
  computingRelationshipValidation = true;
  setImmediate(() => {
    try {
      const elements = getRepository();
      const relationships = getRelationshipRepository();
      const report = validateRelationshipRepository(elements, relationships);
      relationshipValidationCache = { report, computedAt: Date.now() };
    } catch {
      // Keep last cached report if refresh fails.
    } finally {
      computingRelationshipValidation = false;
    }
  });
};

const scheduleHealthSummaryRefresh = () => {
  if (computingHealthSummary) return;
  computingHealthSummary = true;
  setImmediate(() => {
    try {
      const elements = getRepository();
      const relationships = getRelationshipRepository();
      const summary = summarizeRepositoryHealth({ elements, relationships });
      healthSummaryCache = { summary, computedAt: Date.now() };
    } catch {
      // Keep last cached summary if refresh fails.
    } finally {
      computingHealthSummary = false;
    }
  });
};
