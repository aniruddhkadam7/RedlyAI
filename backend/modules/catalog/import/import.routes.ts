// ─── Import Routes ────────────────────────────────────────────────────────

import { Router } from 'express';
import {
  handleExecuteImport,
  handleGetBatch,
  handleGetExistingElement,
  handleGetHistory,
  handleParseCsv,
  handleSuggestMappings,
  handleValidate,
} from './import.controller';

export const createImportRouter = () => {
  const router = Router();

  // CSV parsing
  router.post('/catalog/import/parse', handleParseCsv);

  // Column mapping suggestions
  router.post('/catalog/import/mappings', handleSuggestMappings);

  // Validation & duplicate detection
  router.post('/catalog/import/validate', handleValidate);

  // Execute final import
  router.post('/catalog/import/execute', handleExecuteImport);

  // Import history
  router.get('/catalog/import/history', handleGetHistory);
  router.get('/catalog/import/history/:batchId', handleGetBatch);

  // Existing element lookup (for duplicate preview)
  router.get('/catalog/import/element/:elementId', handleGetExistingElement);

  return router;
};
