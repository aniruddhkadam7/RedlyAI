/**
 * Repository Access Control — FULL ACCESS MODE
 *
 * RBAC and role-based restrictions have been permanently removed.
 * All users have full CRUD access. No permission checks are enforced.
 */

/** Kept for type compatibility. Always 'Owner'. */
export type RepositoryRole = 'Owner';

export const REPOSITORY_ROLES: RepositoryRole[] = ['Owner'];

export const REPOSITORY_ROLE_DESCRIPTIONS: Record<string, string> = {
  Owner: 'Full access (single-user mode).',
};

/** Permanently disabled. */
export const ENABLE_RBAC = false;

export const isRepositoryRole = (_value: unknown): _value is RepositoryRole =>
  true;

export type RepositoryRoleBinding = {
  userId: string;
  role: string;
};

export const validateExclusiveRoleBindings = (
  _bindings: RepositoryRoleBinding[],
): { ok: true } => ({ ok: true });

export type RepositoryPermission = string;

export const ROLE_PERMISSIONS: Record<string, ReadonlySet<string>> = {
  Owner: new Set([
    'read',
    'createElement',
    'editElement',
    'deleteElement',
    'createRelationship',
    'editRelationship',
    'deleteRelationship',
    'createBaseline',
    'createView',
    'editView',
    'deleteBaseline',
    'import',
    'bulkEdit',
    'impactAnalysis',
    'manageRbac',
    'changeGovernanceMode',
    'initializeEnterprise',
  ]),
};

export const assertRbacEnabled = (_context: string): void => {};

/** Always returns true — full access mode. */
export const hasRepositoryPermission = (
  _role: any,
  _permission: any,
): boolean => true;
