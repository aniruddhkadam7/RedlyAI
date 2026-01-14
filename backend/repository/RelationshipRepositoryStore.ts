import { getRepository } from './RepositoryStore';
import { createRelationshipRepository, type RelationshipRepository } from './RelationshipRepository';
import type { BaseArchitectureRelationship } from './BaseArchitectureRelationship';
import { strictValidationEngine } from '../validation/StrictValidationEngine';
import { getGovernanceEnforcementMode } from '../governance/GovernanceEnforcementConfig';

let relationshipRepository: RelationshipRepository | null = null;
let relationshipsRevision = 0;

export function getRelationshipRepositoryRevision(): number {
  return relationshipsRevision;
}

const notifyRelationshipsChanged = () => {
  relationshipsRevision += 1;
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('ea:relationshipsChanged'));
    }
  } catch {
    // Best-effort only.
  }
};

/**
 * Singleton in-memory relationship repository for the running process.
 *
 * - Resets on server restart / refresh.
 * - No persistence.
 */
export function getRelationshipRepository(): RelationshipRepository {
  if (!relationshipRepository) {
    relationshipRepository = createRelationshipRepository(getRepository());
    notifyRelationshipsChanged();
  }
  return relationshipRepository;
}

/**
 * Replace the singleton relationship repository (transactional swap).
 *
 * Intended for bulk operations that must be all-or-nothing (e.g., CSV import).
 */
export function setRelationshipRepository(next: RelationshipRepository) {
  relationshipRepository = next;
  notifyRelationshipsChanged();
}

export function addRelationship(relationship: BaseArchitectureRelationship) {
  const elements = getRepository();
  const relationships = getRelationshipRepository();

  const governanceMode = getGovernanceEnforcementMode();
  const mode = governanceMode === 'Advisory' ? 'Advisory' : 'Strict';

  const validation = strictValidationEngine.validateRelationshipCreation({
    elements,
    relationships,
    candidate: relationship,
    mode,
  });

  if (!validation.ok) {
    return { ok: false, error: validation.message };
  }

  if (validation.warnings?.length) {
    // Surface advisory warnings; console to avoid UI coupling here.
    // eslint-disable-next-line no-console
    console.warn('[governance] advisory relationship warnings:', validation.warnings);
  }

  const result = relationships.addRelationship(relationship);
  if (result.ok) notifyRelationshipsChanged();
  return result;
}
