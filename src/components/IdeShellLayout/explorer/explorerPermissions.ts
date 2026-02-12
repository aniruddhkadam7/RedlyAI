/**
 * Explorer Permission Guard
 *
 * REQUIREMENTS (from spec §10):
 * - Validate permission before every action execution
 * - Hide disallowed context menu items
 * - Block API-level mutation if unauthorized
 *
 * Current implementation delegates to accessControl.ts which is full-access.
 * This guard centralizes the check so that when RBAC is re-enabled,
 * only this file needs to change.
 */

import {
  hasRepositoryPermission,
  type RepositoryRole,
} from '@/repository/accessControl';

// ---------------------------------------------------------------------------
// Permission Map — maps Explorer actions to repository permissions
// ---------------------------------------------------------------------------

export type ExplorerAction =
  | 'read'
  | 'createElement'
  | 'editElement'
  | 'renameElement'
  | 'deleteElement'
  | 'moveElement'
  | 'duplicateElement'
  | 'changeType'
  | 'createRelationship'
  | 'deleteRelationship'
  | 'createView'
  | 'editView'
  | 'renameView'
  | 'deleteView'
  | 'duplicateView'
  | 'exportView'
  | 'createBaseline'
  | 'deleteBaseline'
  | 'import'
  | 'bulkEdit'
  | 'impactAnalysis'
  | 'viewDependencies'
  | 'compareBaseline'
  | 'auditTrail'
  | 'sort'
  | 'paste'
  | 'refresh';

/**
 * Map explorer-level actions to the underlying repository permissions.
 * Some actions map to the same permission (e.g. rename → editElement).
 */
const ACTION_TO_PERMISSION: Record<ExplorerAction, string> = {
  read: 'read',
  createElement: 'createElement',
  editElement: 'editElement',
  renameElement: 'editElement',
  deleteElement: 'deleteElement',
  moveElement: 'editElement',
  duplicateElement: 'createElement',
  changeType: 'editElement',
  createRelationship: 'createRelationship',
  deleteRelationship: 'deleteRelationship',
  createView: 'createView',
  editView: 'editView',
  renameView: 'editView',
  deleteView: 'editView',
  duplicateView: 'createView',
  exportView: 'read',
  createBaseline: 'createBaseline',
  deleteBaseline: 'deleteBaseline',
  import: 'import',
  bulkEdit: 'bulkEdit',
  impactAnalysis: 'impactAnalysis',
  viewDependencies: 'read',
  compareBaseline: 'read',
  auditTrail: 'read',
  sort: 'read',
  paste: 'createElement',
  refresh: 'read',
};

/**
 * Check if the current user role is allowed to perform the given explorer action.
 */
export function canPerform(role: RepositoryRole, action: ExplorerAction): boolean {
  const permission = ACTION_TO_PERMISSION[action];
  if (!permission) return false;
  return hasRepositoryPermission(role, permission);
}

/**
 * Guard: throws if unauthorized. Use for mutation paths.
 */
export function assertCanPerform(role: RepositoryRole, action: ExplorerAction, context?: string): void {
  if (!canPerform(role, action)) {
    const msg = context
      ? `Unauthorized: cannot ${action} — ${context}`
      : `Unauthorized: cannot ${action}`;
    throw new Error(msg);
  }
}

/**
 * Filter a list of context menu items by removing those the user cannot perform.
 * Each item should have an `action` field matching ExplorerAction.
 */
export function filterMenuByPermission<T extends { requiredAction?: ExplorerAction }>(
  items: T[],
  role: RepositoryRole,
): T[] {
  return items.filter(item => {
    if (!item.requiredAction) return true; // no restriction
    return canPerform(role, item.requiredAction);
  });
}
