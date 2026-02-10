import type { RepositoryPermission, RepositoryRole } from './accessControl';
import type { GovernanceMode } from './repositoryMetadata';

/**
 * Element Creation Policy
 *
 * RULE: Architecture elements can ONLY be created from the EA Toolbox.
 *
 * ALLOWED:
 * - Use the EA Toolbox to pick a type
 * - Click or drag onto the canvas to place the new element
 * - Explorer reflects the new element automatically (repository-backed)
 *
 * EXPLICITLY BLOCKED:
 * - Creating elements from Explorer context menus
 * - Creating elements via double-click or keyboard shortcuts
 * - AI-generated element creation on canvas (must be reverted)
 *
 * RATIONALE:
 * - Ensures all elements go through proper validation
 * - Maintains repository integrity
 * - Prevents orphaned elements without proper metadata
 * - Elements need proper UUIDs, timestamps, and type assignment
 *
 * IMPLEMENTATION:
 * - Cytoscape diagrams are configured as READ-ONLY:
 *   - autoungrabify: true (nodes cannot be dragged)
 *   - autounselectify: true (nodes cannot be selected for editing)
 *   - boxSelectionEnabled: false (no box selection)
 *   - No event handlers for element creation (tap, dblclick, etc.)
 * - Only Toolbox-initiated creation can create elements
 * - All elements get: UUID, elementType, createdAt timestamp
 */

/**
 * Validates that element creation is coming from an allowed source.
 * This is a runtime guard that can be called before element creation.
 */
export type ElementCreationSource =
  | 'toolbox'
  | 'explorer-context-menu'
  | 'canvas'
  | 'ai-agent'
  | 'unknown';

export interface ElementCreationGuard {
  ok: boolean;
  source: ElementCreationSource;
  reason?: string;
}

export type RepositoryInitializationState = {
  status: 'initialized' | 'uninitialized';
  reason: string | null;
};

export interface InitializationGuard {
  ok: boolean;
  reason?: string;
}

export type EffectiveGovernanceMode = GovernanceMode | 'Unknown';

export type ModelingAccessDecision =
  | {
      access: 'read-only';
      governanceMode: EffectiveGovernanceMode;
      reason: string;
    }
  | {
      access: 'write';
      governanceMode: GovernanceMode;
      validation: 'blocking' | 'advisory';
      reason: string;
    };

/** Context lock guard for Baseline / Plateau / Roadmap scoped actions. */
export type ContextLockGuard =
  | { locked: false }
  | { locked: true; reason?: string };

/** Returns a standard lock guard for Baseline / Plateau / Roadmap contexts (read-only for all roles). */
export const CONTEXT_LOCKED: ContextLockGuard = {
  locked: true,
  reason:
    'Context is locked (Baseline/Plateau/Roadmap). All roles are read-only; governance is not consulted.',
};

export type PermissionChainOutcome =
  | {
      ok: true;
      governanceMode: GovernanceMode;
      validation: 'blocking' | 'advisory';
      reason: string;
    }
  | { ok: false; failedAt: 'context-lock' | 'role-permission'; reason: string };

/**
 * Check if element creation is allowed from the given source.
 * Only 'toolbox' is allowed.
 */
export function validateElementCreationSource(
  source: ElementCreationSource,
): ElementCreationGuard {
  if (source === 'toolbox') {
    return { ok: true, source };
  }

  if (source === 'explorer-context-menu') {
    return {
      ok: false,
      source,
      reason: 'Explorer does not create elements. Use the EA Toolbox instead.',
    };
  }

  if (source === 'canvas') {
    return {
      ok: false,
      source,
      reason:
        'Element creation on canvas is not allowed. Use Explorer context menu instead.',
    };
  }

  if (source === 'ai-agent') {
    return {
      ok: false,
      source,
      reason:
        'AI-generated canvas elements must be reverted. Use Explorer context menu to create elements.',
    };
  }

  return {
    ok: false,
    source,
    reason: 'Unknown element creation source. Use Explorer context menu.',
  };
}

/**
 * Policy constant for documentation and enforcement.
 */
export const ELEMENT_CREATION_POLICY = {
  allowedSource: 'toolbox' as const,
  blockedSources: [
    'explorer-context-menu',
    'canvas',
    'ai-agent',
    'drag-drop',
    'double-click',
    'keyboard',
  ] as const,
  diagramMode: 'toolbox-create' as const,
  requiredFields: ['id', 'type', 'elementType', 'createdAt', 'name'] as const,
} as const;

/**
 * Blocks modeling actions until the repository is explicitly initialized (Enterprise root exists).
 */
export function guardInitializationForModeling(
  initialization: RepositoryInitializationState | null | undefined,
  action: 'create' | 'import' | 'bulk-edit',
): InitializationGuard {
  if (!initialization || initialization.status === 'initialized') {
    return { ok: true };
  }

  const reason =
    initialization.reason ||
    'Repository is UNINITIALIZED. Initialize the Enterprise root to unlock modeling.';
  return {
    ok: false,
    reason,
  };
}

/**
 * Combine access control and governance mode into an effective modeling decision.
 * Governance modes removed — always returns write access with advisory validation.
 */
export function evaluateModelingAccessWithGovernance(
  _role: RepositoryRole,
  _governanceMode: GovernanceMode | null | undefined,
): ModelingAccessDecision {
  return {
    access: 'write',
    governanceMode: 'Advisory',
    validation: 'advisory',
    reason: 'Full access mode — governance restrictions removed.',
  };
}

/**
 * Enforce ordered permission checks for any user action.
 * Governance modes removed — only context lock is enforced.
 */
export function enforceOrderedPermissionChain(args: {
  contextLock: ContextLockGuard;
  role: RepositoryRole;
  permission: RepositoryPermission;
  governanceMode: GovernanceMode | null | undefined;
}): PermissionChainOutcome {
  if (args.contextLock.locked) {
    return {
      ok: false,
      failedAt: 'context-lock',
      reason:
        args.contextLock.reason ||
        'Action blocked: context is locked (baseline/plateau/roadmap). All roles are read-only.',
    };
  }

  return {
    ok: true,
    governanceMode: 'Advisory',
    validation: 'advisory',
    reason:
      'Full access mode — governance restrictions removed. Only context lock is enforced.',
  };
}
