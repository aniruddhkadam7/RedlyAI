import { createArchitectureRepository, type ArchitectureRepository } from './ArchitectureRepository';
import type { BaseArchitectureElement } from './BaseArchitectureElement';
import type { RepositoryCollectionType } from './ArchitectureRepository';
import type { RelationshipRepository } from './RelationshipRepository';
import { strictValidationEngine, type ValidationGateResult } from '../validation/StrictValidationEngine';
import { getGovernanceEnforcementMode } from '../governance/GovernanceEnforcementConfig';

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
  options?: { relationships?: RelationshipRepository | null; now?: Date; mode?: 'Strict' | 'Advisory' },
): ValidationGateResult {
  const governanceMode = getGovernanceEnforcementMode();
  const mode = options?.mode ?? (governanceMode === 'Advisory' ? 'Advisory' : 'Strict');

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

export function addElement(type: RepositoryCollectionType, element: BaseArchitectureElement) {
  const result = getRepository().addElement(type, element);
  if (result.ok) notifyRepositoryChanged();
  return result;
}
