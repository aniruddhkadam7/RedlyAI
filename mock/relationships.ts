import type { Request, Response } from 'express';

import { getRelationshipRepository } from '../backend/repository/RelationshipRepositoryStore';
import { paginate } from '../mock-helpers/paging';

export default {
  'GET /api/relationships': (req: Request, res: Response) => {
    const repo = getRelationshipRepository();
    const result = paginate(repo.getAllRelationships(), req);
    res.send({ success: true, ...result });
  },

  'GET /api/relationships/by-element/:elementId': (req: Request, res: Response) => {
    const elementId = String((req.params as { elementId?: string } | undefined)?.elementId ?? '').trim();
    const repo = getRelationshipRepository();
    const result = paginate(repo.getRelationshipsForElement(elementId), req);
    res.send({ success: true, ...result });
  },

  'GET /api/relationships/by-type/:relationshipType': (req: Request, res: Response) => {
    const relationshipType = String(
      (req.params as { relationshipType?: string } | undefined)?.relationshipType ?? '',
    ).trim();
    const repo = getRelationshipRepository();
    const result = paginate(repo.getRelationshipsByType(relationshipType), req);
    res.send({ success: true, ...result });
  },
};
