// ─── Import Batch Store ───────────────────────────────────────────────────
// In-memory store for import batch metadata.
// Provides history tracking and audit trail.

import type { ImportBatch } from './import.types';

const batches = new Map<string, ImportBatch>();

/**
 * Create a new import batch record.
 */
export function createBatch(args: {
  id: string;
  fileName: string;
  userId: string;
  totalRecords: number;
}): ImportBatch {
  const batch: ImportBatch = {
    id: args.id,
    status: 'PENDING',
    fileName: args.fileName,
    userId: args.userId,
    totalRecords: args.totalRecords,
    successCount: 0,
    failureCount: 0,
    skippedCount: 0,
    createdAt: new Date().toISOString(),
  };
  batches.set(batch.id, batch);
  return batch;
}

/**
 * Update an existing batch record.
 */
export function updateBatch(
  batchId: string,
  update: Partial<
    Pick<
      ImportBatch,
      | 'status'
      | 'successCount'
      | 'failureCount'
      | 'skippedCount'
      | 'completedAt'
      | 'errorReport'
    >
  >,
): ImportBatch | null {
  const batch = batches.get(batchId);
  if (!batch) return null;

  Object.assign(batch, update);
  return batch;
}

/**
 * Get a batch by ID.
 */
export function getBatch(batchId: string): ImportBatch | null {
  return batches.get(batchId) ?? null;
}

/**
 * Get all import batches, ordered newest first.
 */
export function getAllBatches(): ImportBatch[] {
  return [...batches.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Get import batches with pagination.
 */
export function getBatchesPaginated(
  page = 1,
  pageSize = 20,
): { items: ImportBatch[]; total: number; page: number; pageSize: number } {
  const all = getAllBatches();
  const offset = (Math.max(1, page) - 1) * pageSize;
  return {
    items: all.slice(offset, offset + pageSize),
    total: all.length,
    page,
    pageSize,
  };
}
