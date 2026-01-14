import type { ArchitectureRepository } from '../repository/ArchitectureRepository';
import type { BaseArchitectureElement } from '../repository/BaseArchitectureElement';
import type { BaseArchitectureRelationship } from '../repository/BaseArchitectureRelationship';
import type { RelationshipRepository } from '../repository/RelationshipRepository';

export type IntegrityAuditSeverity = 'Info' | 'Warning' | 'Error';

export type IntegrityAuditCheckId =
  | 'RELATIONSHIP_DANGLING_REFERENCE'
  | 'PROCESS_MULTIPLE_CAPABILITY_PARENTS'
  | 'APPLICATION_DEPENDENCY_CONFLICTING_STRENGTH';

export type IntegrityAuditFinding = {
  id: string;
  checkId: IntegrityAuditCheckId;
  severity: IntegrityAuditSeverity;
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

export type IntegrityAuditReport = {
  observedAt: string;
  findings: IntegrityAuditFinding[];
  summary: {
    total: number;
    bySeverity: Record<IntegrityAuditSeverity, number>;
    byCheckId: Partial<Record<IntegrityAuditCheckId, number>>;
  };
};

const increment = (obj: Record<string, number>, key: string) => {
  obj[key] = (obj[key] ?? 0) + 1;
};

const makeFindingId = (checkId: IntegrityAuditCheckId, subjectId: string) => `${checkId}:${subjectId}`;

const normalizeId = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const getElement = (repo: ArchitectureRepository, id: string): BaseArchitectureElement | null => repo.getElementById(id);

/**
 * Repository integrity audit (passive).
 *
 * - Does not auto-fix data
 * - Does not block usage
 * - Provides transparency for governance
 */
export function auditRepositoryIntegrity(
  elements: ArchitectureRepository,
  relationships: RelationshipRepository,
  now: Date = new Date(),
): IntegrityAuditReport {
  const observedAt = now.toISOString();

  const findings: IntegrityAuditFinding[] = [];

  const allRelationships: BaseArchitectureRelationship[] = relationships.getAllRelationships();

  // 1) Relationships referencing non-existent elements
  for (const rel of allRelationships) {
    const sourceId = normalizeId(rel.sourceElementId);
    const targetId = normalizeId(rel.targetElementId);

    const source = sourceId ? getElement(elements, sourceId) : null;
    const target = targetId ? getElement(elements, targetId) : null;

    if (!source) {
      findings.push({
        id: makeFindingId('RELATIONSHIP_DANGLING_REFERENCE', `${rel.id}:source`),
        checkId: 'RELATIONSHIP_DANGLING_REFERENCE',
        severity: 'Error',
        message: `Relationship references non-existent source element ("${sourceId || '<missing>'}").`,
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

    if (!target) {
      findings.push({
        id: makeFindingId('RELATIONSHIP_DANGLING_REFERENCE', `${rel.id}:target`),
        checkId: 'RELATIONSHIP_DANGLING_REFERENCE',
        severity: 'Error',
        message: `Relationship references non-existent target element ("${targetId || '<missing>'}").`,
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

  // 2) Multiple Capability parents for one Process (based on explicit DECOMPOSES_TO relationships)
  const parentCapabilitiesByProcessId = new Map<string, Set<string>>();

  for (const rel of relationships.getRelationshipsByType('DECOMPOSES_TO')) {
    const processId = normalizeId(rel.targetElementId);
    const capabilityId = normalizeId(rel.sourceElementId);
    if (!processId || !capabilityId) continue;

    const set = parentCapabilitiesByProcessId.get(processId);
    if (set) set.add(capabilityId);
    else parentCapabilitiesByProcessId.set(processId, new Set([capabilityId]));
  }

  for (const [processId, capabilityIds] of parentCapabilitiesByProcessId) {
    if (capabilityIds.size <= 1) continue;

    findings.push({
      id: makeFindingId('PROCESS_MULTIPLE_CAPABILITY_PARENTS', processId),
      checkId: 'PROCESS_MULTIPLE_CAPABILITY_PARENTS',
      severity: 'Error',
      message: `BusinessProcess "${processId}" is decomposed under multiple Capabilities: ${Array.from(capabilityIds)
        .sort()
        .map((id) => `"${id}"`)
        .join(', ')}.`,
      observedAt,
      subjectKind: 'Element',
      subjectId: processId,
      subjectType: 'BusinessProcess',
    });
  }

  // 3) Application dependencies with conflicting strength
  const strengthsByPair = new Map<string, Set<string>>();

  const appDeps = ([] as any[])
    .concat(relationships.getRelationshipsByType('INTEGRATES_WITH'))
    ;

  for (const rel of appDeps) {
    const from = normalizeId(rel.sourceElementId);
    const to = normalizeId(rel.targetElementId);
    if (!from || !to) continue;

    const strengthRaw = (rel as unknown as { dependencyStrength?: unknown }).dependencyStrength;
    const strength = typeof strengthRaw === 'string' ? strengthRaw.trim() : '';
    if (!strength) continue;

    const key = `${from}->${to}`;
    const set = strengthsByPair.get(key);
    if (set) set.add(strength);
    else strengthsByPair.set(key, new Set([strength]));
  }

  for (const [pair, strengths] of strengthsByPair) {
    if (strengths.size <= 1) continue;

    findings.push({
      id: makeFindingId('APPLICATION_DEPENDENCY_CONFLICTING_STRENGTH', pair),
      checkId: 'APPLICATION_DEPENDENCY_CONFLICTING_STRENGTH',
      severity: 'Warning',
      message: `Application dependency "${pair}" has conflicting dependencyStrength values: ${Array.from(strengths)
        .sort()
        .map((s) => `"${s}"`)
        .join(', ')}.`,
      observedAt,
      subjectKind: 'Element',
      subjectId: pair,
      subjectType: 'ApplicationDependency',
      relationshipType: 'INTEGRATES_WITH',
    });
  }

  const bySeverity: Record<IntegrityAuditSeverity, number> = { Info: 0, Warning: 0, Error: 0 };
  const byCheckId: Partial<Record<IntegrityAuditCheckId, number>> = {};

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
