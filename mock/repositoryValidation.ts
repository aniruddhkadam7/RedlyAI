import type { Request, Response } from 'express';

import { validateArchitectureRepository } from '../backend/analysis/RepositoryValidation';
import { validateRelationshipRepository } from '../backend/analysis/RelationshipValidation';
import { getRepository } from '../backend/repository/RepositoryStore';
import { getRelationshipRepository } from '../backend/repository/RelationshipRepositoryStore';
import { summarizeRepositoryHealth } from '../backend/validation/RepositoryHealth';

export default {
  'GET /api/repository/validation': (_req: Request, res: Response) => {
    const repo = getRepository();
    const report = validateArchitectureRepository(repo);
    res.send({ success: true, data: report });
  },

  'GET /api/repository/relationship-validation': (_req: Request, res: Response) => {
    const elements = getRepository();
    const relationships = getRelationshipRepository();
    const report = validateRelationshipRepository(elements, relationships);
    res.send({ success: true, data: report });
  },

  'GET /api/repository/health-summary': (_req: Request, res: Response) => {
    const elements = getRepository();
    const relationships = getRelationshipRepository();
    const summary = summarizeRepositoryHealth({ elements, relationships });
    res.send({ success: true, data: summary });
  },
};
