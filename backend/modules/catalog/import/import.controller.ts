// ─── Import Controller ────────────────────────────────────────────────────
// Express request handlers for the CSV import feature.

import type { Request, Response } from 'express';
import { getExistingApplication } from './duplicateService';
import {
  checkMappings,
  executeImport,
  getImportBatch,
  getImportHistory,
  parseUploadedCsv,
  suggestMappings,
  validateAndDetectDuplicates,
} from './import.service';
import type { ColumnMapping, DuplicateStrategy } from './import.types';

/**
 * POST /api/catalog/import/parse
 * Parses uploaded CSV content and returns headers + row preview.
 */
export function handleParseCsv(req: Request, res: Response) {
  try {
    const { content } = req.body as { content?: string };
    if (!content || typeof content !== 'string') {
      res
        .status(400)
        .json({ success: false, errorMessage: 'Missing CSV content.' });
      return;
    }

    const result = parseUploadedCsv(content);
    res.json({
      success: true,
      data: {
        headers: result.headers,
        preview: result.rows.slice(0, 10),
        totalRows: result.totalRows,
        parseErrors: result.errors,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      errorMessage: `Parse failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

/**
 * POST /api/catalog/import/mappings
 * Returns auto-detected column mappings and available target fields.
 */
export function handleSuggestMappings(req: Request, res: Response) {
  try {
    const { headers } = req.body as { headers?: string[] };
    if (!headers || !Array.isArray(headers)) {
      res
        .status(400)
        .json({ success: false, errorMessage: 'Missing headers array.' });
      return;
    }

    const result = suggestMappings(headers);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({
      success: false,
      errorMessage: `Mapping failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

/**
 * POST /api/catalog/import/validate
 * Validates mapped data and detects duplicates.
 * Accepts either rows array OR raw CSV content for full-file validation.
 */
export function handleValidate(req: Request, res: Response) {
  try {
    const startTime = Date.now();
    const { rows, mappings, duplicateStrategy, csvContent } = req.body as {
      rows?: Record<string, string>[];
      mappings?: ColumnMapping[];
      duplicateStrategy?: DuplicateStrategy;
      csvContent?: string;
    };

    if (!mappings || !Array.isArray(mappings)) {
      res
        .status(400)
        .json({ success: false, errorMessage: 'Missing mappings array.' });
      return;
    }

    // If csvContent is provided, re-parse to get all rows.
    let dataRows: Record<string, string>[] = rows ?? [];
    if (csvContent && typeof csvContent === 'string') {
      const parsed = parseUploadedCsv(csvContent);
      dataRows = parsed.rows;
    }

    if (dataRows.length === 0) {
      res
        .status(400)
        .json({ success: false, errorMessage: 'No data rows to validate.' });
      return;
    }

    const mapCheck = checkMappings(mappings);
    if (!mapCheck.valid) {
      res.status(400).json({
        success: false,
        errorMessage: `Missing required mappings: ${mapCheck.missingRequired.join(', ')}`,
        data: { missingRequired: mapCheck.missingRequired },
      });
      return;
    }

    const result = validateAndDetectDuplicates(
      dataRows,
      mappings,
      duplicateStrategy ?? 'UPDATE_EXISTING',
    );

    const elapsed = Date.now() - startTime;
    if (elapsed > 10000) {
      console.warn(`Import validation took ${elapsed}ms.`);
    }

    res.json({
      success: true,
      data: {
        validCount: result.validRecords.length,
        invalidCount: result.invalidRecords.length,
        duplicateCount: result.duplicateRecords.length,
        totalProcessed: result.totalProcessed,
        validRecords: result.validRecords.slice(0, 50),
        invalidRecords: result.invalidRecords,
        duplicateRecords: result.duplicateRecords.slice(0, 50),
        duplicateMatches: result.duplicateMatches,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      errorMessage: `Validation failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

/**
 * POST /api/catalog/import/execute
 * Executes the final import into the repository.
 */
export function handleExecuteImport(req: Request, res: Response) {
  try {
    const { validRecords, duplicateRecords, fileName, userId } = req.body as {
      validRecords?: any[];
      duplicateRecords?: any[];
      fileName?: string;
      userId?: string;
    };

    if (!validRecords && !duplicateRecords) {
      res
        .status(400)
        .json({ success: false, errorMessage: 'No records to import.' });
      return;
    }

    const result = executeImport({
      validRecords: validRecords ?? [],
      duplicateRecords: duplicateRecords ?? [],
      fileName: fileName ?? 'unknown.csv',
      userId: userId ?? 'system',
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({
      success: false,
      errorMessage: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

/**
 * GET /api/catalog/import/history
 * Returns paginated import history.
 */
export function handleGetHistory(req: Request, res: Response) {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 20);
    const result = getImportHistory(page, pageSize);
    res.json({
      success: true,
      data: result.items,
      pagination: {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      errorMessage: `Failed to fetch history: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

/**
 * GET /api/catalog/import/history/:batchId
 * Returns a single import batch record.
 */
export function handleGetBatch(req: Request, res: Response) {
  try {
    const batchId = (req.params as { batchId?: string }).batchId ?? '';
    const batch = getImportBatch(batchId);
    if (!batch) {
      res
        .status(404)
        .json({ success: false, errorMessage: 'Batch not found.' });
      return;
    }
    res.json({ success: true, data: batch });
  } catch (err) {
    res.status(500).json({
      success: false,
      errorMessage: `Failed to fetch batch: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

/**
 * GET /api/catalog/import/element/:elementId
 * Returns an existing application for duplicate preview.
 */
export function handleGetExistingElement(req: Request, res: Response) {
  try {
    const elementId = (req.params as { elementId?: string }).elementId ?? '';
    const element = getExistingApplication(elementId);
    if (!element) {
      res
        .status(404)
        .json({ success: false, errorMessage: 'Element not found.' });
      return;
    }
    res.json({ success: true, data: element });
  } catch (err) {
    res.status(500).json({
      success: false,
      errorMessage: `Failed to fetch element: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
