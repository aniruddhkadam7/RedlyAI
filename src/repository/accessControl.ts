/**
 * Repository Access Control Model
 *
 * Defines top-level roles for a repository.
 *
 * Roles (exclusive per user per repository):
 * - Owner: full control over repository metadata, modeling, governance settings, and exports.
 * - Architect: can model (create/update/delete elements and relationships), run analyses, and export; cannot change repository ownership metadata.
 * - Viewer: read-only; can browse, run read-only analyses, and export read-only views if allowed; no mutations.
 *
 * Owners do NOT bypass context locks or validation pipelines; enforcement layers must still run.
 */
export type RepositoryRole = 'Owner' | 'Architect' | 'Viewer';

export const REPOSITORY_ROLES: RepositoryRole[] = ['Owner', 'Architect', 'Viewer'];

export const REPOSITORY_ROLE_DESCRIPTIONS: Record<RepositoryRole, string> = {
  Owner: 'Full control: governance settings, metadata, modeling, and exports.',
  Architect: 'Modeling focus: create/update objects and relationships, author views/layouts; cannot govern, delete baselines, or change ownership.',
  Viewer: 'Read-only: browse Explorer, properties, impact analysis, views/roadmaps/baselines; no create/edit/delete.',
};

/**
 * TEMPORARY FEATURE FLAG: disable RBAC while keeping the model intact.
 * RBAC temporarily disabled via feature flag. Do not remove RBAC logic.
 * Re-enable by setting ENABLE_RBAC = true.
 */
export const ENABLE_RBAC = false;

export const isRepositoryRole = (value: unknown): value is RepositoryRole => {
  return typeof value === 'string' && (REPOSITORY_ROLES as readonly string[]).includes(value);
};

/** Single role assignment for a user within a repository. */
export type RepositoryRoleBinding = {
  userId: string;
  role: RepositoryRole;
};

export const validateExclusiveRoleBindings = (
  bindings: RepositoryRoleBinding[],
): { ok: true } | { ok: false; error: string } => {
  if (!ENABLE_RBAC) {
    // RBAC bypassed: reject role-binding attempts to avoid mixed states.
    return { ok: false, error: 'RBAC is disabled (single-user mode).' };
  }
  const seen = new Set<string>();
  for (const b of bindings) {
    if (!b?.userId || !isRepositoryRole(b?.role)) {
      return { ok: false, error: 'Invalid role binding.' };
    }
    if (seen.has(b.userId)) {
      return { ok: false, error: `User ${b.userId} cannot hold multiple roles for the same repository.` };
    }
    seen.add(b.userId);
  }
  return { ok: true };
};

export type RepositoryPermission =
  | 'initializeEnterprise'
  | 'createElement'
  | 'editElement'
  | 'deleteElement'
  | 'createRelationship'
  | 'editRelationship'
  | 'deleteRelationship'
  | 'createBaseline'
  | 'createView'
  | 'editView'
  | 'deleteBaseline'
  | 'import'
  | 'bulkEdit'
  | 'impactAnalysis'
  | 'manageRbac'
  | 'changeGovernanceMode'
  | 'read';

const OWNER_PERMISSIONS: ReadonlySet<RepositoryPermission> = new Set([
  'initializeEnterprise',
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
  'read',
]);

const ARCHITECT_PERMISSIONS: ReadonlySet<RepositoryPermission> = new Set([
  'createElement',
  'editElement',
  'createRelationship',
  'editRelationship',
  'createView',
  'editView',
  'read',
  // Explicitly excluded: initializeEnterprise, deleteBaseline.
]);

const VIEWER_PERMISSIONS: ReadonlySet<RepositoryPermission> = new Set([
  'impactAnalysis',
  'read',
  // Views are consumable under read; no create/edit/delete.
]);

export const ROLE_PERMISSIONS: Record<RepositoryRole, ReadonlySet<RepositoryPermission>> = {
  Owner: OWNER_PERMISSIONS,
  Architect: ARCHITECT_PERMISSIONS,
  Viewer: VIEWER_PERMISSIONS,
};

export const assertRbacEnabled = (context: string): void => {
  if (!ENABLE_RBAC) {
    throw new Error(`RBAC is disabled (single-user mode): ${context}`);
  }
};

export const hasRepositoryPermission = (
  role: RepositoryRole,
  permission: RepositoryPermission,
): boolean => {
  if (!ENABLE_RBAC) {
    // Temporary single-user mode: grant full access while RBAC is disabled.
    return true;
  }
  return ROLE_PERMISSIONS[role].has(permission);
};
