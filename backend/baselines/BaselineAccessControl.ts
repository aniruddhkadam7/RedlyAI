// GLOBAL RULE: Baselines freeze truth. Baselines are immutable. No feature may modify baseline data.

/**
 * Future-ready access control hooks for baseline operations.
 * Currently permissive, but all baseline mutations must flow through these guards.
 */
export const isBaselineActorAuthorized = (actor?: string | null): boolean => {
  // TODO: Plug in real authorization (RBAC/ABAC) when user roles are available.
  // For now, allow all actors while preserving the guard seam.
  return true;
};

export const assertBaselineCreateAllowed = (actor?: string | null): void => {
  if (!isBaselineActorAuthorized(actor)) {
    throw new Error('Baseline creation is restricted to authorized users.');
  }
};

export const assertBaselineDeleteAllowed = (actor?: string | null): void => {
  if (!isBaselineActorAuthorized(actor)) {
    throw new Error('Baseline deletion is restricted to authorized users.');
  }
};
