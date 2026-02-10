import type { Request, Response } from 'express';

import { getRepository } from '../backend/repository/RepositoryStore';
import { paginate } from '../mock-helpers/paging';

const filterByWorkspace = <T extends { workspaceId?: string }>(
  items: T[],
  req: Request,
) => {
  const workspaceId =
    typeof req.query.workspaceId === 'string'
      ? req.query.workspaceId.trim()
      : '';
  if (!workspaceId) return items;
  return items.filter((item) => item.workspaceId === workspaceId);
};

export default {
  'GET /api/repository/capabilities': (req: Request, res: Response) => {
    const repo = getRepository();
    const items = filterByWorkspace(
      repo.getElementsByType('capabilities'),
      req,
    );
    const result = paginate(items, req);
    res.send({ success: true, ...result });
  },

  'GET /api/repository/processes': (req: Request, res: Response) => {
    const repo = getRepository();
    const items = filterByWorkspace(
      repo.getElementsByType('businessProcesses'),
      req,
    );
    const result = paginate(items, req);
    res.send({ success: true, ...result });
  },

  'GET /api/repository/applications': (req: Request, res: Response) => {
    const repo = getRepository();
    const items = filterByWorkspace(
      repo.getElementsByType('applications'),
      req,
    );
    const result = paginate(items, req);
    res.send({ success: true, ...result });
  },

  'GET /api/repository/technologies': (req: Request, res: Response) => {
    const repo = getRepository();
    const items = filterByWorkspace(
      repo.getElementsByType('technologies'),
      req,
    );
    const result = paginate(items, req);
    res.send({ success: true, ...result });
  },

  'GET /api/repository/programmes': (req: Request, res: Response) => {
    const repo = getRepository();
    const items = filterByWorkspace(
      repo.getElementsByType('programmes'),
      req,
    );
    const result = paginate(items, req);
    res.send({ success: true, ...result });
  },
};
