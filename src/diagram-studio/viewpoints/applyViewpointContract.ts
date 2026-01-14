import type { BaseArchitectureElement } from '../../../backend/repository/BaseArchitectureElement';
import type { BaseArchitectureRelationship } from '../../../backend/repository/BaseArchitectureRelationship';
import { ViewpointRegistry, type ViewpointDefinition } from './ViewpointRegistry';

export type ViewpointContractInput = {
  readonly viewpointId: string;
  readonly elements: readonly BaseArchitectureElement[];
  readonly relationships: readonly BaseArchitectureRelationship[];
};

export type ViewpointContractResult = {
  readonly elements: readonly BaseArchitectureElement[];
  readonly relationships: readonly BaseArchitectureRelationship[];
};

const normalize = (value: string): string => (value ?? '').trim();

const resolveViewpoint = (viewpointId: string): ViewpointDefinition => {
  return ViewpointRegistry.require(viewpointId);
};

/**
 * Enforce viewpoint contract: only emit elements/relationships explicitly allowed by the viewpoint.
 * No inference, no warnings, no side effects.
 */
export function applyViewpointContract(input: ViewpointContractInput): ViewpointContractResult {
  const viewpoint = resolveViewpoint(input.viewpointId);
  const allowedElementTypes = new Set(viewpoint.allowedElementTypes.map(normalize));
  const allowedRelationshipTypes = new Set(viewpoint.allowedRelationshipTypes.map(normalize));

  const filteredElements = (input.elements ?? []).filter((element) => {
    return allowedElementTypes.has(normalize(element.elementType));
  });

  const allowedElementIds = new Set(filteredElements.map((e) => normalize(e.id)));

  const filteredRelationships = (input.relationships ?? []).filter((relationship) => {
    if (!allowedRelationshipTypes.has(normalize(relationship.relationshipType))) return false;
    if (!allowedElementTypes.has(normalize(relationship.sourceElementType))) return false;
    if (!allowedElementTypes.has(normalize(relationship.targetElementType))) return false;

    const sourceId = normalize(relationship.sourceElementId);
    const targetId = normalize(relationship.targetElementId);
    return allowedElementIds.has(sourceId) && allowedElementIds.has(targetId);
  });

  return {
    elements: filteredElements,
    relationships: filteredRelationships,
  };
}
