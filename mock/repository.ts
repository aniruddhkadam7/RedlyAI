import type { Request, Response } from 'express';

import { getRepository } from '../backend/repository/RepositoryStore';
import { paginate } from '../mock-helpers/paging';

export default {
  'GET /api/repository/capabilities': (req: Request, res: Response) => {
    const repo = getRepository();
    const result = paginate(repo.getElementsByType('capabilities'), req);
    res.send({ success: true, ...result });
  },

  'GET /api/repository/processes': (req: Request, res: Response) => {
    const repo = getRepository();
    const result = paginate(repo.getElementsByType('businessProcesses'), req);
    res.send({ success: true, ...result });
  },

  'GET /api/repository/applications': (req: Request, res: Response) => {
    const repo = getRepository();
    const result = paginate(repo.getElementsByType('applications'), req);
    res.send({ success: true, ...result });
  },

  'GET /api/repository/technologies': (req: Request, res: Response) => {
    const repo = getRepository();
    const result = paginate(repo.getElementsByType('technologies'), req);
    res.send({ success: true, ...result });
  },

  'GET /api/repository/programmes': (req: Request, res: Response) => {
    const repo = getRepository();
    const result = paginate(repo.getElementsByType('programmes'), req);
    res.send({ success: true, ...result });
  },
};
