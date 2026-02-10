// ─── Import Service ───────────────────────────────────────────────────────
// Orchestrates the entire CSV import pipeline:
// Parse → Map → Validate → Detect Duplicates → Batch Insert → Events

import { randomUUID } from 'node:crypto';
import type { Application } from '../../../repository/Application';
import { addElement, getRepository } from '../../../repository/RepositoryStore';
import { parseCsv } from './csvParser';
import { detectDuplicates } from './duplicateService';
import type {
  ColumnMapping,
  CsvParseResult,
  DuplicateStrategy,
  FieldValidationError,
  ImportBatch,
  ImportRecord,
  ValidationResult,
} from './import.types';
import {
  createBatch,
  getBatch,
  getBatchesPaginated,
  updateBatch,
} from './importBatchStore';
import {
  applyMappings,
  autoDetectMappings,
  getAvailableTargetFields,
  validateMappings,
} from './mappingEngine';
import { validateBatch } from './validationEngine';

const BATCH_SIZE = 200;

// ─── Step 1: Parse ────────────────────────────────────────────────────────

export function parseUploadedCsv(content: string): CsvParseResult {
  return parseCsv(content);
}

// ─── Step 2: Map ──────────────────────────────────────────────────────────

export function suggestMappings(csvHeaders: string[]): {
  mappings: ColumnMapping[];
  targetFields: ReturnType<typeof getAvailableTargetFields>;
} {
  return {
    mappings: autoDetectMappings(csvHeaders),
    targetFields: getAvailableTargetFields(),
  };
}

export function checkMappings(mappings: ColumnMapping[]) {
  return validateMappings(mappings);
}

// ─── Step 3: Validate & Detect Duplicates ─────────────────────────────────

export function validateAndDetectDuplicates(
  csvRows: Record<string, string>[],
  mappings: ColumnMapping[],
  defaultDuplicateStrategy: DuplicateStrategy = 'UPDATE_EXISTING',
): ValidationResult & {
  duplicateMatches: ReturnType<typeof detectDuplicates>;
} {
  // Build import records from raw CSV data + mappings.
  const records: ImportRecord[] = csvRows.map((row, index) => ({
    rowIndex: index + 1,
    status: 'VALID' as const,
    data: row,
    mapped: applyMappings(row, mappings),
    errors: [],
  }));

  // Run validation.
  const validationResult = validateBatch(records);

  // Detect duplicates among valid records.
  const allNonInvalid = [
    ...validationResult.validRecords,
    ...validationResult.duplicateRecords,
  ];
  const duplicateMatches = detectDuplicates(
    allNonInvalid,
    defaultDuplicateStrategy,
  );

  // Re-classify: move newly detected duplicates from valid to duplicate.
  const finalValid: ImportRecord[] = [];
  const finalDuplicates: ImportRecord[] = [
    ...validationResult.duplicateRecords,
  ];

  for (const record of validationResult.validRecords) {
    if (record.status === 'DUPLICATE') {
      finalDuplicates.push(record);
    } else {
      finalValid.push(record);
    }
  }

  return {
    validRecords: finalValid,
    invalidRecords: validationResult.invalidRecords,
    duplicateRecords: finalDuplicates,
    totalProcessed: validationResult.totalProcessed,
    duplicateMatches,
  };
}

// ─── Step 4: Execute Import ───────────────────────────────────────────────

function buildApplicationElement(mapped: Record<string, unknown>): Application {
  const now = new Date().toISOString();
  const id = randomUUID();
  const name = String(mapped.name ?? '').trim();

  return {
    id,
    name,
    description: String(mapped.description ?? ''),
    elementType: 'Application',
    layer: 'Application',
    lifecycleStatus: (mapped.lifecycleStatus as any) || 'Active',
    lifecycleStartDate: now,
    ownerRole: String(mapped.ownerRole ?? 'IT Owner'),
    ownerName: String(mapped.ownerName ?? ''),
    owningUnit: String(mapped.owningUnit ?? ''),
    approvalStatus: 'Draft',
    lastReviewedAt: now,
    reviewCycleMonths: 12,
    createdAt: now,
    createdBy: 'csv-import',
    lastModifiedAt: now,
    lastModifiedBy: 'csv-import',
    applicationCode:
      String(mapped.applicationCode ?? '') ||
      `APP-${id.slice(0, 8).toUpperCase()}`,
    applicationType: (mapped.applicationType as any) || 'Custom',
    businessCriticality: (mapped.businessCriticality as any) || 'Medium',
    availabilityTarget: Number(mapped.availabilityTarget) || 99.9,
    deploymentModel: (mapped.deploymentModel as any) || 'Cloud',
    vendorLockInRisk: (mapped.vendorLockInRisk as any) || 'Medium',
    technicalDebtLevel: (mapped.technicalDebtLevel as any) || 'Medium',
    annualRunCost: Number(mapped.annualRunCost) || 0,
    vendorName: String(mapped.vendorName ?? ''),
  };
}

function updateExistingApplication(
  existingId: string,
  mapped: Record<string, unknown>,
): boolean {
  const repo = getRepository();
  const existing = repo.getElementById(existingId);
  if (!existing || existing.elementType !== 'Application') return false;

  const now = new Date().toISOString();
  const app = existing as Application;

  // Update mutable fields.
  if (mapped.name) app.name = String(mapped.name);
  if (mapped.description) app.description = String(mapped.description);
  if (mapped.lifecycleStatus)
    app.lifecycleStatus = mapped.lifecycleStatus as any;
  if (mapped.ownerName) app.ownerName = String(mapped.ownerName);
  if (mapped.ownerRole) app.ownerRole = String(mapped.ownerRole);
  if (mapped.owningUnit) app.owningUnit = String(mapped.owningUnit);
  if (mapped.businessCriticality)
    app.businessCriticality = mapped.businessCriticality as any;
  if (mapped.deploymentModel)
    app.deploymentModel = mapped.deploymentModel as any;
  if (mapped.vendorName) app.vendorName = String(mapped.vendorName);
  if (mapped.annualRunCost) app.annualRunCost = Number(mapped.annualRunCost);
  if (mapped.availabilityTarget)
    app.availabilityTarget = Number(mapped.availabilityTarget);
  if (mapped.vendorLockInRisk)
    app.vendorLockInRisk = mapped.vendorLockInRisk as any;
  if (mapped.technicalDebtLevel)
    app.technicalDebtLevel = mapped.technicalDebtLevel as any;

  app.lastModifiedAt = now;
  app.lastModifiedBy = 'csv-import';

  return true;
}

/**
 * Execute the actual import into the repository.
 * Processes records in batches for performance.
 */
export function executeImport(args: {
  validRecords: ImportRecord[];
  duplicateRecords: ImportRecord[];
  fileName: string;
  userId: string;
}): ImportBatch {
  const batchId = randomUUID();
  const totalRecords = args.validRecords.length + args.duplicateRecords.length;

  createBatch({
    id: batchId,
    fileName: args.fileName,
    userId: args.userId,
    totalRecords,
  });

  updateBatch(batchId, { status: 'IMPORTING' });

  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;
  const errorReport: FieldValidationError[] = [];

  // Process new records in batches.
  for (let i = 0; i < args.validRecords.length; i += BATCH_SIZE) {
    const chunk = args.validRecords.slice(i, i + BATCH_SIZE);

    for (const record of chunk) {
      try {
        const element = buildApplicationElement(record.mapped);
        const result = addElement('applications', element);

        if (result.ok) {
          successCount++;
        } else {
          failureCount++;
          errorReport.push({
            row: record.rowIndex,
            field: '',
            value: '',
            message: `Insert failed: ${(result as any).error ?? 'Unknown error'}`,
          });
        }
      } catch (err) {
        failureCount++;
        errorReport.push({
          row: record.rowIndex,
          field: '',
          value: '',
          message: `Exception: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  // Process duplicate records.
  for (const record of args.duplicateRecords) {
    const strategy = record.duplicateStrategy ?? 'UPDATE_EXISTING';

    if (strategy === 'SKIP') {
      skippedCount++;
      continue;
    }

    if (strategy === 'CREATE_NEW') {
      try {
        const element = buildApplicationElement(record.mapped);
        // Generate a new unique name to avoid collision.
        element.name = `${element.name} (imported)`;
        const result = addElement('applications', element);
        if (result.ok) {
          successCount++;
        } else {
          failureCount++;
          errorReport.push({
            row: record.rowIndex,
            field: '',
            value: '',
            message: `Duplicate CREATE_NEW failed: ${(result as any).error ?? 'Unknown error'}`,
          });
        }
      } catch (err) {
        failureCount++;
        errorReport.push({
          row: record.rowIndex,
          field: '',
          value: '',
          message: `Exception: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      continue;
    }

    // UPDATE_EXISTING
    if (record.duplicateOf) {
      const updated = updateExistingApplication(
        record.duplicateOf,
        record.mapped,
      );
      if (updated) {
        successCount++;
      } else {
        failureCount++;
        errorReport.push({
          row: record.rowIndex,
          field: '',
          value: '',
          message: `Update failed for existing element ${record.duplicateOf}.`,
        });
      }
    }
  }

  const status = failureCount === totalRecords ? 'FAILED' : 'COMPLETED';

  updateBatch(batchId, {
    status,
    successCount,
    failureCount,
    skippedCount,
    completedAt: new Date().toISOString(),
    errorReport: errorReport.length > 0 ? errorReport : undefined,
  });

  const finalBatch = getBatch(batchId);
  if (!finalBatch) {
    throw new Error('Import batch not found.');
  }
  return finalBatch;
}

// ─── History ──────────────────────────────────────────────────────────────

export function getImportHistory(page = 1, pageSize = 20) {
  return getBatchesPaginated(page, pageSize);
}

export function getImportBatch(batchId: string) {
  return getBatch(batchId);
}
