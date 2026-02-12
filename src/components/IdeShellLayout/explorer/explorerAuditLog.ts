/**
 * Explorer Audit Logger — Records Every Mutation
 *
 * REQUIREMENTS (from spec §11):
 * For every mutation, record:
 *   user_id, action_type, object_id, timestamp, before_state (JSON), after_state (JSON)
 *
 * Storage: In-memory ring buffer + localStorage persistence.
 * In a production system this would go to a server-side audit table.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditActionType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'RENAME'
  | 'MOVE'
  | 'DUPLICATE'
  | 'CHANGE_TYPE'
  | 'ADD_TO_VIEW'
  | 'REMOVE_FROM_VIEW'
  | 'CREATE_RELATIONSHIP'
  | 'DELETE_RELATIONSHIP'
  | 'CREATE_BASELINE'
  | 'CREATE_VIEW'
  | 'DELETE_VIEW'
  | 'RENAME_VIEW'
  | 'DUPLICATE_VIEW'
  | 'EXPORT_VIEW';

export type AuditEntry = {
  id: string;
  userId: string;
  actionType: AuditActionType;
  objectId: string;
  objectType?: string;
  timestamp: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const MAX_ENTRIES = 2000;
const STORAGE_KEY = 'ea.explorer.auditLog';

let entries: AuditEntry[] = [];
let initialized = false;

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) entries = parsed.slice(-MAX_ENTRIES);
    }
  } catch { /* corrupted storage — start fresh */ }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch { /* quota exceeded — tolerate */ }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let idCounter = Date.now();

/**
 * Record an audit entry. Automatically generates id + timestamp if omitted.
 */
export function writeAuditEntry(entry: Omit<AuditEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): AuditEntry {
  ensureInitialized();
  const full: AuditEntry = {
    id: entry.id ?? `audit-${++idCounter}`,
    userId: entry.userId,
    actionType: entry.actionType,
    objectId: entry.objectId,
    objectType: entry.objectType,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    beforeState: entry.beforeState,
    afterState: entry.afterState,
    metadata: entry.metadata,
  };
  entries.push(full);
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  persist();
  return full;
}

/**
 * Convenience: capture before/after diff for an object mutation.
 */
export function auditObjectMutation(params: {
  userId: string;
  actionType: AuditActionType;
  objectId: string;
  objectType?: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}): AuditEntry {
  return writeAuditEntry({
    userId: params.userId,
    actionType: params.actionType,
    objectId: params.objectId,
    objectType: params.objectType,
    beforeState: params.before,
    afterState: params.after,
    metadata: params.metadata,
  });
}

/**
 * Query the audit log.
 */
export function queryAuditLog(filter?: {
  objectId?: string;
  actionType?: AuditActionType;
  userId?: string;
  since?: string;
  limit?: number;
}): AuditEntry[] {
  ensureInitialized();
  let result = entries;
  if (filter?.objectId) result = result.filter(e => e.objectId === filter.objectId);
  if (filter?.actionType) result = result.filter(e => e.actionType === filter.actionType);
  if (filter?.userId) result = result.filter(e => e.userId === filter.userId);
  if (filter?.since) result = result.filter(e => e.timestamp >= filter.since!);
  const limit = filter?.limit ?? 100;
  return result.slice(-limit).reverse();
}

/**
 * Get audit trail for a specific object.
 */
export function getObjectAuditTrail(objectId: string, limit = 50): AuditEntry[] {
  return queryAuditLog({ objectId, limit });
}

/**
 * Clear the in-memory + persisted audit log (for testing/reset).
 */
export function clearAuditLog(): void {
  entries = [];
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
