import type { ArchitectureRepository } from '../repository/ArchitectureRepository';
import type { BaseArchitectureElement } from '../repository/BaseArchitectureElement';
import type { BaseArchitectureRelationship } from '../repository/BaseArchitectureRelationship';
import type { RelationshipRepository } from '../repository/RelationshipRepository';

export type RelationshipValidationSeverity = 'Info' | 'Warning' | 'Error';

export type RelationshipValidationCheckId =
  | 'APPLICATION_DEPENDS_ON_SELF'
  | 'PROCESS_MISSING_CAPABILITY_PARENT'
  | 'APPLICATION_DEPENDENCY_MISSING_STRENGTH'
  | 'PROGRAMME_IMPACTS_RETIRED_ELEMENT';

export type RelationshipValidationFinding = {
  id: string;
  checkId: RelationshipValidationCheckId;
  severity: RelationshipValidationSeverity;
  message: string;
  observedAt: string;

  subjectKind: 'Relationship' | 'Element';
  subjectId: string;
  subjectType: string;

  relationshipType?: string;
  sourceElementId?: string;
  sourceElementType?: string;
  targetElementId?: string;
  targetElementType?: string;
};

export type RelationshipValidationReport = {
  observedAt: string;
  findings: RelationshipValidationFinding[];
  summary: {
    total: number;
    bySeverity: Record<RelationshipValidationSeverity, number>;
    byCheckId: Partial<Record<RelationshipValidationCheckId, number>>;
  };
};

const increment = (obj: Record<string, number>, key: string) => {
  obj[key] = (obj[key] ?? 0) + 1;
};

const isBlank = (value: unknown): boolean => typeof value !== 'string' || value.trim().length === 0;

const makeFindingId = (checkId: RelationshipValidationCheckId, subjectId: string) => `${checkId}:${subjectId}`;

const getElement = (repo: ArchitectureRepository, id: string): BaseArchitectureElement | null => repo.getElementById(id);

/**
 * Passive, read-only governance checks over relationships + select cross-cutting linkage rules.
 *
 * - No enforcement
 * - No blocking writes
 * - No persistence
 */
export function validateRelationshipRepository(
  elements: ArchitectureRepository,
  relationships: RelationshipRepository,
  now: Date = new Date(),
): RelationshipValidationReport {
  const observedAt = now.toISOString();

  const findings: RelationshipValidationFinding[] = [];

  const applicationDependencyRelationships = ([] as BaseArchitectureRelationship[])
    .concat(relationships.getRelationshipsByType('INTEGRATES_WITH'));

  // 1) Application depends on itself => invalid (Error)
  for (const rel of applicationDependencyRelationships) {
    const sourceId = (rel.sourceElementId ?? '').trim();
    const targetId = (rel.targetElementId ?? '').trim();
    if (sourceId && targetId && sourceId === targetId) {
      findings.push({
        id: makeFindingId('APPLICATION_DEPENDS_ON_SELF', rel.id),
        checkId: 'APPLICATION_DEPENDS_ON_SELF',
        severity: 'Error',
        message: `Application dependency is invalid: an Application cannot ${String(rel.relationshipType)} itself ("${sourceId}").`,
        observedAt,
        subjectKind: 'Relationship',
        subjectId: rel.id,
        subjectType: 'BaseArchitectureRelationship',
        relationshipType: rel.relationshipType,
        sourceElementId: rel.sourceElementId,
        sourceElementType: rel.sourceElementType,
        targetElementId: rel.targetElementId,
        targetElementType: rel.targetElementType,
      });
    }
  }

  // 2) Process without Capability parent => invalid (Error)
  for (const process of elements.getElementsByType('businessProcesses')) {
    const parentId = (process.parentCapabilityId ?? '').trim();
    if (!parentId) {
      findings.push({
        id: makeFindingId('PROCESS_MISSING_CAPABILITY_PARENT', process.id),
        checkId: 'PROCESS_MISSING_CAPABILITY_PARENT',
        severity: 'Error',
        message: `BusinessProcess is invalid: missing parent Capability id.` ,
        observedAt,
        subjectKind: 'Element',
        subjectId: process.id,
        subjectType: process.elementType,
      });
      continue;
    }

    const parent = getElement(elements, parentId);
    if (!parent || parent.elementType !== 'Capability') {
      findings.push({
        id: makeFindingId('PROCESS_MISSING_CAPABILITY_PARENT', process.id),
        checkId: 'PROCESS_MISSING_CAPABILITY_PARENT',
        severity: 'Error',
        message: `BusinessProcess is invalid: parentCapabilityId "${parentId}" does not reference an existing Capability.`,
        observedAt,
        subjectKind: 'Element',
        subjectId: process.id,
        subjectType: process.elementType,
      });
    }
  }

  // 3) Application dependency without dependencyStrength => warning
  for (const rel of applicationDependencyRelationships) {
    const dependencyStrength = (rel as unknown as { dependencyStrength?: unknown }).dependencyStrength;
    if (isBlank(dependencyStrength)) {
      findings.push({
        id: makeFindingId('APPLICATION_DEPENDENCY_MISSING_STRENGTH', rel.id),
        checkId: 'APPLICATION_DEPENDENCY_MISSING_STRENGTH',
        severity: 'Warning',
        message:
          'Application dependency is missing dependencyStrength (expected Hard | Soft). This reduces impact analysis accuracy.',
        observedAt,
        subjectKind: 'Relationship',
        subjectId: rel.id,
        subjectType: 'BaseArchitectureRelationship',
        relationshipType: rel.relationshipType,
        sourceElementId: rel.sourceElementId,
        sourceElementType: rel.sourceElementType,
        targetElementId: rel.targetElementId,
        targetElementType: rel.targetElementType,
      });
    }
  }

  // 4) Programme impacting retired elements => warning
  for (const rel of relationships.getRelationshipsByType('IMPACTS')) {
    const targetId = (rel.targetElementId ?? '').trim();
    if (!targetId) continue;

    const target = getElement(elements, targetId);
    if (!target) continue;

    if (target.lifecycleStatus === 'Retired') {
      findings.push({
        id: makeFindingId('PROGRAMME_IMPACTS_RETIRED_ELEMENT', rel.id),
        checkId: 'PROGRAMME_IMPACTS_RETIRED_ELEMENT',
        severity: 'Warning',
        message: `Programme impact targets a Retired element (target "${targetId}"). Confirm intent or update lifecycle.`,
        observedAt,
        subjectKind: 'Relationship',
        subjectId: rel.id,
        subjectType: 'BaseArchitectureRelationship',
        relationshipType: rel.relationshipType,
        sourceElementId: rel.sourceElementId,
        sourceElementType: rel.sourceElementType,
        targetElementId: rel.targetElementId,
        targetElementType: rel.targetElementType,
      });
    }
  }

  const bySeverity: Record<RelationshipValidationSeverity, number> = { Info: 0, Warning: 0, Error: 0 };
  const byCheckId: Partial<Record<RelationshipValidationCheckId, number>> = {};

  for (const finding of findings) {
    increment(bySeverity, finding.severity);
    increment(byCheckId as Record<string, number>, finding.checkId);
  }

  return {
    observedAt,
    findings,
    summary: {
      total: findings.length,
      bySeverity,
      byCheckId,
    },
  };
}
