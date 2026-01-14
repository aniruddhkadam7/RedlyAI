import type { ArchitectureRepository } from './ArchitectureRepository';
import type { BaseArchitectureRelationship } from './BaseArchitectureRelationship';
import { getRelationshipEndpointRule, isKnownRelationshipType } from '../relationships/RelationshipSemantics';

export type RelationshipRepositoryAddSuccess = { ok: true };
export type RelationshipRepositoryAddFailure = { ok: false; error: string };
export type RelationshipRepositoryAddResult =
  | RelationshipRepositoryAddSuccess
  | RelationshipRepositoryAddFailure;


const normalizeId = (value: string) => (value ?? '').trim();

const normalizeType = (value: string) => (value ?? '').trim();

const isAllowedEndpoint = (relationshipType: string, fromType: string, toType: string): boolean => {
  const rule = getRelationshipEndpointRule(relationshipType);
  if (!rule) return false;

  if (Array.isArray((rule as any).pairs) && (rule as any).pairs.length > 0) {
    return (rule as any).pairs.some((p: any) => p?.from === fromType && p?.to === toType);
  }

  return rule.from.includes(fromType) && rule.to.includes(toType);
};

/**
 * In-memory relationship repository.
 *
 * Responsibilities:
 * - Store relationships by type.
 * - Enforce valid source/target element types.
 * - Enforce no dangling references (source/target element IDs must exist).
 * - Reject invalid relationships.
 *
 * Non-responsibilities:
 * - No persistence.
 * - No APIs.
 * - No graph traversal or transitive inference.
 */
export class RelationshipRepository {
  private readonly elements: ArchitectureRepository;

  private readonly byId = new Map<string, BaseArchitectureRelationship>();
  private readonly relationshipIdsByType = new Map<string, string[]>();
  private readonly relationshipIdsByElementId = new Map<string, string[]>();

  constructor(elements: ArchitectureRepository) {
    this.elements = elements;
  }

  addRelationship(relationship: BaseArchitectureRelationship): RelationshipRepositoryAddResult {
    const id = normalizeId(relationship.id);
    if (!id) return { ok: false, error: 'Rejected insert: relationship.id is required.' };

    if (this.byId.has(id)) {
      return { ok: false, error: `Rejected insert: duplicate relationship id: ${id}` };
    }

    const relationshipType = normalizeType(relationship.relationshipType);
    if (!relationshipType) {
      return { ok: false, error: 'Rejected insert: relationship.relationshipType is required.' };
    }

    const sourceElementId = normalizeId(relationship.sourceElementId);
    const targetElementId = normalizeId(relationship.targetElementId);

    if (!sourceElementId) return { ok: false, error: 'Rejected insert: sourceElementId is required.' };
    if (!targetElementId) return { ok: false, error: 'Rejected insert: targetElementId is required.' };

    const sourceElementType = normalizeType(relationship.sourceElementType);
    const targetElementType = normalizeType(relationship.targetElementType);

    if (!sourceElementType) return { ok: false, error: 'Rejected insert: sourceElementType is required.' };
    if (!targetElementType) return { ok: false, error: 'Rejected insert: targetElementType is required.' };

    if (relationship.direction !== 'OUTGOING') {
      return {
        ok: false,
        error: `Rejected insert: direction must be OUTGOING (got "${String(relationship.direction)}").`,
      };
    }

    // Enforce that the relationship type is one we can validate safely.
    if (!isKnownRelationshipType(relationshipType)) {
      return {
        ok: false,
        error: `Rejected insert: unsupported relationshipType "${relationshipType}" (no endpoint rules defined).`,
      };
    }

    // Enforce no dangling references.
    const source = this.elements.getElementById(sourceElementId);
    if (!source) {
      return { ok: false, error: `Rejected insert: unknown sourceElementId "${sourceElementId}".` };
    }

    const target = this.elements.getElementById(targetElementId);
    if (!target) {
      return { ok: false, error: `Rejected insert: unknown targetElementId "${targetElementId}".` };
    }

    // Enforce endpoint types match the referenced elements.
    if (source.elementType !== sourceElementType) {
      return {
        ok: false,
        error: `Rejected insert: sourceElementType mismatch for "${sourceElementId}" (expected "${source.elementType}", got "${sourceElementType}").`,
      };
    }

    if (target.elementType !== targetElementType) {
      return {
        ok: false,
        error: `Rejected insert: targetElementType mismatch for "${targetElementId}" (expected "${target.elementType}", got "${targetElementType}").`,
      };
    }

    // Enforce allowed endpoint types for this relationshipType.
    if (!isAllowedEndpoint(relationshipType, sourceElementType, targetElementType)) {
      return {
        ok: false,
        error: `Rejected insert: invalid endpoints for relationshipType "${relationshipType}" ("${sourceElementType}" -> "${targetElementType}").`,
      };
    }

    // Insert.
    this.byId.set(id, relationship);

    const existingTypeIds = this.relationshipIdsByType.get(relationshipType);
    if (existingTypeIds) existingTypeIds.push(id);
    else this.relationshipIdsByType.set(relationshipType, [id]);

    const indexElement = (elementId: string) => {
      const existing = this.relationshipIdsByElementId.get(elementId);
      if (existing) existing.push(id);
      else this.relationshipIdsByElementId.set(elementId, [id]);
    };

    indexElement(sourceElementId);
    indexElement(targetElementId);

    return { ok: true };
  }

  getRelationshipsByType(type: string): BaseArchitectureRelationship[] {
    const key = normalizeType(type);
    const ids = this.relationshipIdsByType.get(key) ?? [];
    return ids.map((id) => this.byId.get(id)!).filter(Boolean);
  }

  getRelationshipsForElement(elementId: string): BaseArchitectureRelationship[] {
    const key = normalizeId(elementId);
    const ids = this.relationshipIdsByElementId.get(key) ?? [];
    return ids.map((id) => this.byId.get(id)!).filter(Boolean);
  }

  getOutgoingRelationships(elementId: string): BaseArchitectureRelationship[] {
    const key = normalizeId(elementId);
    return this.getRelationshipsForElement(key).filter((r) => normalizeId(r.sourceElementId) === key);
  }

  getAllRelationships(): BaseArchitectureRelationship[] {
    return Array.from(this.byId.values());
  }
}

export function createRelationshipRepository(elements: ArchitectureRepository): RelationshipRepository {
  return new RelationshipRepository(elements);
}
