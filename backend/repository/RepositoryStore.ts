import { getGovernanceEnforcementMode } from '../governance/GovernanceEnforcementConfig';
import {
  strictValidationEngine,
  type ValidationGateResult,
} from '../validation/StrictValidationEngine';
import type { RepositoryCollectionType } from './ArchitectureRepository';
import {
  type ArchitectureRepository,
  createArchitectureRepository,
} from './ArchitectureRepository';
import type { BaseArchitectureElement } from './BaseArchitectureElement';
import type { RelationshipRepository } from './RelationshipRepository';

let repository: ArchitectureRepository | null = null;
let repositoryRevision = 0;

export function getRepositoryRevision(): number {
  return repositoryRevision;
}

const notifyRepositoryChanged = () => {
  repositoryRevision += 1;
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('ea:repositoryChanged'));
    }
  } catch {
    // Best-effort only.
  }
};

/**
 * Singleton in-memory repository for the running process.
 *
 * - Resets on server restart / refresh.
 * - No persistence.
 */
export function getRepository(): ArchitectureRepository {
  if (!repository) {
    repository = createArchitectureRepository();
    notifyRepositoryChanged();
  }
  return repository;
}

/**
 * Replace the singleton repository (transactional swap).
 *
 * Intended for bulk operations that must be all-or-nothing (e.g., CSV import).
 */
export function setRepository(
  next: ArchitectureRepository,
  options?: {
    relationships?: RelationshipRepository | null;
    now?: Date;
    mode?: 'Strict' | 'Advisory';
  },
): ValidationGateResult {
  const governanceMode = getGovernanceEnforcementMode();
  const mode =
    options?.mode ?? (governanceMode === 'Advisory' ? 'Advisory' : 'Strict');

  const validation = strictValidationEngine.validateOnSave({
    elements: next,
    relationships: options?.relationships ?? null,
    now: options?.now,
    mode,
  });

  if (!validation.ok) return validation;

  repository = next;
  notifyRepositoryChanged();
  return validation;
}

export function addElement(
  type: RepositoryCollectionType,
  element: BaseArchitectureElement,
) {
  const result = getRepository().addElement(type, element);
  if (result.ok) notifyRepositoryChanged();
  return result;
}

export function updateElementLifecycle(
  elementId: string,
  args: {
    lifecycleStatus: BaseArchitectureElement['lifecycleStatus'];
    lastModifiedAt?: string;
    lastModifiedBy?: string;
  },
) {
  const result = getRepository().updateElementLifecycle({
    id: elementId,
    lifecycleStatus: args.lifecycleStatus,
    lastModifiedAt: args.lastModifiedAt,
    lastModifiedBy: args.lastModifiedBy,
  });
  if (result.ok) notifyRepositoryChanged();
  return result;
}

export function removeElement(elementId: string) {
  const result = getRepository().removeElementById(elementId);
  if (result.ok) notifyRepositoryChanged();
  return result;
}
