import { Router } from 'express';
import {
  deleteCatalogDetail,
  getCatalogDetail,
  getCatalogList,
  getCatalogStats,
  updateCatalogLifecycleStatus,
} from './catalog.controller';

export const createCatalogRouter = () => {
  const router = Router();

  router.get('/catalog/:domain', getCatalogList);
  router.get('/catalog/:domain/stats', getCatalogStats);
  router.get('/catalog/:domain/:id', getCatalogDetail);
  router.delete('/catalog/:domain/:id', deleteCatalogDetail);
  router.patch('/catalog/:domain/:id/lifecycle', updateCatalogLifecycleStatus);

  return router;
};
