import { EaRepository } from '@/pages/dependency-view/utils/eaRepository';

import { validateArchitectureRepository } from '../../backend/analysis/RepositoryValidation';
import { validateRelationshipRepository } from '../../backend/analysis/RelationshipValidation';
import { ArchitectureRepository } from '../../backend/repository/ArchitectureRepository';
import { createRelationshipRepository } from '../../backend/repository/RelationshipRepository';

import type { LifecycleCoverage } from '@/repository/repositoryMetadata';
import { getLifecycleStateFromAttributes } from '@/repository/lifecycleCoveragePolicy';

export type GovernanceDebtSummary = {
  mandatoryFindingCount: number;
  relationshipErrorCount: number;
  relationshipWarningCount: number;
  invalidRelationshipInsertCount: number;
  lifecycleTagMissingCount: number;
  total: number;
};

export type GovernanceDebt = {
  summary: GovernanceDebtSummary;
  repoReport: ReturnType<typeof validateArchitectureRepository>;
  relationshipReport: ReturnType<typeof validateRelationshipRepository>;
  invalidRelationshipInserts: string[];
  lifecycleTagMissingIds: string[];
};

const getString = (value: unknown): string => (typeof value === 'string' ? value : '');
const getNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const getBool = (value: unknown): boolean => value === true;

const normalizeId = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const isSoftDeleted = (attrs: Record<string, unknown> | null | undefined) => (attrs as any)?._deleted === true;

const increment = (obj: Record<string, number>, key: string) => {
  obj[key] = (obj[key] ?? 0) + 1;
};

const toBackendElementType = (eaType: string): string => {
  if (eaType === 'Capability' || eaType === 'SubCapability' || eaType === 'CapabilityCategory') return 'Capability';
  if (eaType === 'BusinessProcess') return 'BusinessProcess';
  if (eaType === 'BusinessService') return 'BusinessService';
  if (eaType === 'Application') return 'Application';
  if (eaType === 'ApplicationService') return 'ApplicationService';
  if (eaType === 'Technology') return 'Technology';
  if (eaType === 'Programme') return 'Programme';
  if (eaType === 'Project') return 'Project';
  if (eaType === 'Enterprise') return 'Enterprise';
  if (eaType === 'Department') return 'Department';
  return eaType;
};

export function buildGovernanceDebt(
  eaRepository: EaRepository,
  nowDate: Date = new Date(),
  options?: { lifecycleCoverage?: LifecycleCoverage | null; governanceMode?: 'Strict' | 'Advisory' | null },
): GovernanceDebt {
  const repo = new ArchitectureRepository();
  const now = nowDate.toISOString();

  const lifecycleCoverage = options?.lifecycleCoverage ?? null;
  const lifecycleTagMissingIds: string[] = [];

  for (const obj of eaRepository.objects.values()) {
    const attrs = obj.attributes ?? {};

    if (lifecycleCoverage === 'Both' && attrs._deleted !== true) {
      const state = getLifecycleStateFromAttributes(attrs);
      if (!state) lifecycleTagMissingIds.push(obj.id);
    }

    const name = typeof attrs.name === 'string' && attrs.name.trim() ? attrs.name.trim() : obj.id;

    if (obj.type === 'Capability' || obj.type === 'CapabilityCategory' || obj.type === 'SubCapability') {
      repo.addElement('capabilities', {
        id: obj.id,
        name,
        description: getString(attrs.description),
        elementType: 'Capability',
        layer: 'Business',
        lifecycleStatus: (attrs.lifecycleStatus as any) || 'Active',
        lifecycleStartDate: getString(attrs.lifecycleStartDate),
        lifecycleEndDate: getString(attrs.lifecycleEndDate) || undefined,
        ownerRole: getString(attrs.ownerRole),
        ownerName: getString(attrs.ownerName),
        owningUnit: getString(attrs.owningUnit),
        approvalStatus: (attrs.approvalStatus as any) || 'Draft',
        lastReviewedAt: getString(attrs.lastReviewedAt),
        reviewCycleMonths: getNumber(attrs.reviewCycleMonths),
        createdAt: getString(attrs.createdAt) || now,
        createdBy: getString(attrs.createdBy),
        lastModifiedAt: getString(attrs.lastModifiedAt) || now,
        lastModifiedBy: getString(attrs.lastModifiedBy),

        capabilityType: (attrs.capabilityType as any) || 'Core',
        businessValue: (attrs.businessValue as any) || 'Medium',
        maturityLevel: (attrs.maturityLevel as any) || 'Developing',
        parentCapabilityId: getString(attrs.parentCapabilityId),
      } as any);
      continue;
    }

    if (obj.type === 'Application') {
      repo.addElement('applications', {
        id: obj.id,
        name,
        description: getString(attrs.description),
        elementType: 'Application',
        layer: 'Application',
        lifecycleStatus: (attrs.lifecycleStatus as any) || 'Active',
        lifecycleStartDate: getString(attrs.lifecycleStartDate),
        lifecycleEndDate: getString(attrs.lifecycleEndDate) || undefined,
        ownerRole: getString(attrs.ownerRole),
        ownerName: getString(attrs.ownerName),
        owningUnit: getString(attrs.owningUnit),
        approvalStatus: (attrs.approvalStatus as any) || 'Draft',
        lastReviewedAt: getString(attrs.lastReviewedAt),
        reviewCycleMonths: getNumber(attrs.reviewCycleMonths),
        createdAt: getString(attrs.createdAt) || now,
        createdBy: getString(attrs.createdBy),
        lastModifiedAt: getString(attrs.lastModifiedAt) || now,
        lastModifiedBy: getString(attrs.lastModifiedBy),

        applicationType: (attrs.applicationType as any) || 'Custom',
        vendor: getString(attrs.vendor),
        version: getString(attrs.version),
        hostingModel: (attrs.hostingModel as any) || 'OnPrem',
        technologyStack: Array.isArray(attrs.technologyStack) ? attrs.technologyStack : [],
        userCountEstimate: getNumber(attrs.userCountEstimate),
        criticality: (attrs.criticality as any) || 'Medium',
        dataClassification: (attrs.dataClassification as any) || 'Internal',
        integrations: Array.isArray(attrs.integrations) ? attrs.integrations : [],
      } as any);
      continue;
    }

    if (obj.type === 'Technology') {
      repo.addElement('technologies', {
        id: obj.id,
        name,
        description: getString(attrs.description),
        elementType: 'Technology',
        layer: 'Technology',
        lifecycleStatus: (attrs.lifecycleStatus as any) || 'Active',
        lifecycleStartDate: getString(attrs.lifecycleStartDate),
        lifecycleEndDate: getString(attrs.lifecycleEndDate) || undefined,
        ownerRole: getString(attrs.ownerRole),
        ownerName: getString(attrs.ownerName),
        owningUnit: getString(attrs.owningUnit),
        approvalStatus: (attrs.approvalStatus as any) || 'Draft',
        lastReviewedAt: getString(attrs.lastReviewedAt),
        reviewCycleMonths: getNumber(attrs.reviewCycleMonths),
        createdAt: getString(attrs.createdAt) || now,
        createdBy: getString(attrs.createdBy),
        lastModifiedAt: getString(attrs.lastModifiedAt) || now,
        lastModifiedBy: getString(attrs.lastModifiedBy),

        technologyType: (attrs.technologyType as any) || 'Platform',
        vendor: getString(attrs.vendor),
        version: getString(attrs.version),
        category: getString(attrs.category),
        deploymentModel: (attrs.deploymentModel as any) || 'OnPrem',
        supportEndDate: getString(attrs.supportEndDate),
        standardApproved: getBool(attrs.standardApproved),
      } as any);
      continue;
    }

    if (obj.type === 'BusinessProcess') {
      repo.addElement('businessProcesses', {
        id: obj.id,
        name,
        description: getString(attrs.description),
        elementType: 'BusinessProcess',
        layer: 'Business',
        lifecycleStatus: (attrs.lifecycleStatus as any) || 'Active',
        lifecycleStartDate: getString(attrs.lifecycleStartDate),
        lifecycleEndDate: getString(attrs.lifecycleEndDate) || undefined,
        ownerRole: getString(attrs.ownerRole),
        ownerName: getString(attrs.ownerName),
        owningUnit: getString(attrs.owningUnit),
        approvalStatus: (attrs.approvalStatus as any) || 'Draft',
        lastReviewedAt: getString(attrs.lastReviewedAt),
        reviewCycleMonths: getNumber(attrs.reviewCycleMonths),
        createdAt: getString(attrs.createdAt) || now,
        createdBy: getString(attrs.createdBy),
        lastModifiedAt: getString(attrs.lastModifiedAt) || now,
        lastModifiedBy: getString(attrs.lastModifiedBy),

        processOwner: getString(attrs.processOwner),
        triggeringEvent: getString(attrs.triggeringEvent),
        expectedOutcome: getString(attrs.expectedOutcome),
        frequency: (attrs.frequency as any) || 'Ad-hoc',
        criticality: (attrs.criticality as any) || 'Medium',
        regulatoryRelevant: getBool(attrs.regulatoryRelevant),
        complianceNotes: getString(attrs.complianceNotes),
        parentCapabilityId: getString(attrs.parentCapabilityId),
      } as any);
      continue;
    }

    if (obj.type === 'Enterprise') {
      repo.addElement('enterprises', {
        id: obj.id,
        name,
        description: getString(attrs.description),
        elementType: 'Enterprise',
        layer: 'Business',
        lifecycleStatus: (attrs.lifecycleStatus as any) || 'Active',
        lifecycleStartDate: getString(attrs.lifecycleStartDate),
        lifecycleEndDate: getString(attrs.lifecycleEndDate) || undefined,
        ownerRole: getString(attrs.ownerRole),
        ownerName: getString(attrs.ownerName),
        owningUnit: getString(attrs.owningUnit),
        approvalStatus: (attrs.approvalStatus as any) || 'Draft',
        lastReviewedAt: getString(attrs.lastReviewedAt),
        reviewCycleMonths: getNumber(attrs.reviewCycleMonths),
        createdAt: getString(attrs.createdAt) || now,
        createdBy: getString(attrs.createdBy),
        lastModifiedAt: getString(attrs.lastModifiedAt) || now,
        lastModifiedBy: getString(attrs.lastModifiedBy),
        parentEnterpriseId: getString(attrs.parentEnterpriseId) || null,
      } as any);
      continue;
    }

    if (obj.type === 'Department') {
      repo.addElement('departments', {
        id: obj.id,
        name,
        description: getString(attrs.description),
        elementType: 'Department',
        layer: 'Business',
        lifecycleStatus: (attrs.lifecycleStatus as any) || 'Active',
        lifecycleStartDate: getString(attrs.lifecycleStartDate),
        lifecycleEndDate: getString(attrs.lifecycleEndDate) || undefined,
        ownerRole: getString(attrs.ownerRole),
        ownerName: getString(attrs.ownerName),
        owningUnit: getString(attrs.owningUnit),
        approvalStatus: (attrs.approvalStatus as any) || 'Draft',
        lastReviewedAt: getString(attrs.lastReviewedAt),
        reviewCycleMonths: getNumber(attrs.reviewCycleMonths),
        createdAt: getString(attrs.createdAt) || now,
        createdBy: getString(attrs.createdBy),
        lastModifiedAt: getString(attrs.lastModifiedAt) || now,
        lastModifiedBy: getString(attrs.lastModifiedBy),
      } as any);
      continue;
    }

    if (obj.type === 'BusinessService') {
      repo.addElement('businessServices', {
        id: obj.id,
        name,
        description: getString(attrs.description),
        elementType: 'BusinessService',
        layer: 'Business',
        lifecycleStatus: (attrs.lifecycleStatus as any) || 'Active',
        lifecycleStartDate: getString(attrs.lifecycleStartDate),
        lifecycleEndDate: getString(attrs.lifecycleEndDate) || undefined,
        ownerRole: getString(attrs.ownerRole),
        ownerName: getString(attrs.ownerName),
        owningUnit: getString(attrs.owningUnit),
        approvalStatus: (attrs.approvalStatus as any) || 'Draft',
        lastReviewedAt: getString(attrs.lastReviewedAt),
        reviewCycleMonths: getNumber(attrs.reviewCycleMonths),
        createdAt: getString(attrs.createdAt) || now,
        createdBy: getString(attrs.createdBy),
        lastModifiedAt: getString(attrs.lastModifiedAt) || now,
        lastModifiedBy: getString(attrs.lastModifiedBy),
      } as any);
      continue;
    }

    if (obj.type === 'ApplicationService') {
      repo.addElement('applicationServices', {
        id: obj.id,
        name,
        description: getString(attrs.description),
        elementType: 'ApplicationService',
        layer: 'Application',
        lifecycleStatus: (attrs.lifecycleStatus as any) || 'Active',
        lifecycleStartDate: getString(attrs.lifecycleStartDate),
        lifecycleEndDate: getString(attrs.lifecycleEndDate) || undefined,
        ownerRole: getString(attrs.ownerRole),
        ownerName: getString(attrs.ownerName),
        owningUnit: getString(attrs.owningUnit),
        approvalStatus: (attrs.approvalStatus as any) || 'Draft',
        lastReviewedAt: getString(attrs.lastReviewedAt),
        reviewCycleMonths: getNumber(attrs.reviewCycleMonths),
        createdAt: getString(attrs.createdAt) || now,
        createdBy: getString(attrs.createdBy),
        lastModifiedAt: getString(attrs.lastModifiedAt) || now,
        lastModifiedBy: getString(attrs.lastModifiedBy),
      } as any);
      continue;
    }

    if (obj.type === 'Programme') {
      repo.addElement('programmes', {
        id: obj.id,
        name,
        description: getString(attrs.description),
        elementType: 'Programme',
        layer: 'Strategy',
        lifecycleStatus: (attrs.lifecycleStatus as any) || 'Active',
        lifecycleStartDate: getString(attrs.lifecycleStartDate),
        lifecycleEndDate: getString(attrs.lifecycleEndDate) || undefined,
        ownerRole: getString(attrs.ownerRole),
        ownerName: getString(attrs.ownerName),
        owningUnit: getString(attrs.owningUnit),
        approvalStatus: (attrs.approvalStatus as any) || 'Draft',
        lastReviewedAt: getString(attrs.lastReviewedAt),
        reviewCycleMonths: getNumber(attrs.reviewCycleMonths),
        createdAt: getString(attrs.createdAt) || now,
        createdBy: getString(attrs.createdBy),
        lastModifiedAt: getString(attrs.lastModifiedAt) || now,
        lastModifiedBy: getString(attrs.lastModifiedBy),

        programmeType: (attrs.programmeType as any) || 'Transformation',
        strategicObjective: getString(attrs.strategicObjective),
        startDate: getString(attrs.startDate),
        endDate: getString(attrs.endDate),
        budgetEstimate: getNumber(attrs.budgetEstimate),
        fundingStatus: (attrs.fundingStatus as any) || 'Proposed',
        expectedBusinessImpact: getString(attrs.expectedBusinessImpact),
        riskLevel: (attrs.riskLevel as any) || 'Medium',
      } as any);
      continue;
    }

    if (obj.type === 'Project') {
      repo.addElement('projects', {
        id: obj.id,
        name,
        description: getString(attrs.description),
        elementType: 'Project',
        layer: 'Strategy',
        lifecycleStatus: (attrs.lifecycleStatus as any) || 'Active',
        lifecycleStartDate: getString(attrs.lifecycleStartDate),
        lifecycleEndDate: getString(attrs.lifecycleEndDate) || undefined,
        ownerRole: getString(attrs.ownerRole),
        ownerName: getString(attrs.ownerName),
        owningUnit: getString(attrs.owningUnit),
        approvalStatus: (attrs.approvalStatus as any) || 'Draft',
        lastReviewedAt: getString(attrs.lastReviewedAt),
        reviewCycleMonths: getNumber(attrs.reviewCycleMonths),
        createdAt: getString(attrs.createdAt) || now,
        createdBy: getString(attrs.createdBy),
        lastModifiedAt: getString(attrs.lastModifiedAt) || now,
        lastModifiedBy: getString(attrs.lastModifiedBy),
      } as any);
    }
  }

  // Enterprise-grade governance rules (Strict mode consumes these via summary.total).
  const extraRepoFindings: any[] = [];

  const addRepoFinding = (args: {
    checkId: string;
    severity: 'Info' | 'Warning' | 'Error';
    message: string;
    elementId: string;
    elementType: string;
    collection: string;
  }) => {
    const severity: 'Info' | 'Warning' | 'Error' =
      options?.governanceMode === 'Advisory' && args.severity === 'Error' ? 'Warning' : args.severity;
    extraRepoFindings.push({
      id: `${args.checkId}:${args.elementId}`,
      checkId: args.checkId,
      severity,
      message: args.message,
      elementId: args.elementId,
      elementType: args.elementType,
      collection: args.collection,
      observedAt: now,
    });
  };

  const getObj = (id: string) => eaRepository.objects.get(id);

  const displayName = (obj: { id: string; attributes?: Record<string, unknown> } | null | undefined): string => {
    if (!obj) return '';
    const raw = (obj.attributes as any)?.name;
    const name = typeof raw === 'string' ? raw.trim() : '';
    return name || obj.id;
  };

  const activeObjects = Array.from(eaRepository.objects.values()).filter((o) => !isSoftDeleted(o.attributes));

  const eaRelationships = eaRepository.relationships;

  const activeRelEndpoints = (rel: { fromId: string; toId: string }) => {
    const from = getObj(rel.fromId);
    const to = getObj(rel.toId);
    if (!from || !to) return null;
    if (isSoftDeleted(from.attributes) || isSoftDeleted(to.attributes)) return null;
    return { from, to };
  };

  // 1) Ownership: every Capability, Application, Programme must be owned by exactly one Enterprise.
  // 0) Required fields (repository-level).
  for (const obj of activeObjects) {
    const name = typeof (obj.attributes as any)?.name === 'string' ? String((obj.attributes as any).name).trim() : '';
    if (!name) {
      addRepoFinding({
        checkId: 'EA_REQUIRED_NAME',
        severity: 'Error',
        message: `${obj.type} ‘${obj.id}’ has no name.`,
        elementId: obj.id,
        elementType: obj.type,
        collection: 'elements',
      });
    }

    const ownerId = typeof (obj.attributes as any)?.ownerId === 'string'
      ? String((obj.attributes as any).ownerId).trim()
      : '';
    if (!ownerId) {
      addRepoFinding({
        checkId: 'EA_REQUIRED_OWNER',
        severity: 'Error',
        message: `${obj.type} ‘${displayName(obj)}’ has no owner (Enterprise/Department).`,
        elementId: obj.id,
        elementType: obj.type,
        collection: 'elements',
      });
      continue;
    }

    // Allow self-ownership for owner types to support bootstrapping.
    if ((obj.type === 'Enterprise' || obj.type === 'Department') && ownerId === obj.id) {
      continue;
    }

    const owner = getObj(ownerId);
    if (!owner || isSoftDeleted(owner.attributes) || (owner.type !== 'Enterprise' && owner.type !== 'Department')) {
      addRepoFinding({
        checkId: 'EA_INVALID_OWNER',
        severity: 'Error',
        message: `${obj.type} ‘${displayName(obj)}’ has an invalid owner (must reference an existing Enterprise/Department).`,
        elementId: obj.id,
        elementType: obj.type,
        collection: 'elements',
      });
    }
  }

  // 1) Ownership: every Capability, Application, Programme must be owned by exactly one Enterprise.
  const ownedTypes = new Set<string>(['Capability', 'SubCapability', 'Application', 'Programme']);
  for (const obj of activeObjects) {
    if (!ownedTypes.has(obj.type)) continue;

    const owning = eaRelationships.filter((r) => {
      if (r.type !== 'OWNS') return false;
      if (normalizeId(r.toId) !== obj.id) return false;
      const endpoints = activeRelEndpoints(r);
      return endpoints?.from.type === 'Enterprise';
    });

    if (owning.length !== 1) {
      const expected = 'exactly one owning Enterprise';
      const got = owning.length;
      addRepoFinding({
        checkId: 'EA_ENTERPRISE_OWNERSHIP',
        severity: 'Error',
        message: `${obj.type} ‘${displayName(obj)}’ must have ${expected} via OWNS (found ${got}).`,
        elementId: obj.id,
        elementType: obj.type,
        collection: obj.type === 'Application' ? 'applications' : obj.type === 'Programme' ? 'programmes' : 'capabilities',
      });
    }
  }

  // 2) Departments cannot exist without an Enterprise.
  for (const dept of activeObjects.filter((o) => o.type === 'Department')) {
    const owningEnterpriseLinks = eaRelationships.filter((r) => {
      if (r.type !== 'HAS') return false;
      if (normalizeId(r.toId) !== dept.id) return false;
      const endpoints = activeRelEndpoints(r);
      return endpoints?.from.type === 'Enterprise';
    });

    if (owningEnterpriseLinks.length !== 1) {
      addRepoFinding({
        checkId: 'EA_DEPARTMENT_REQUIRES_ENTERPRISE',
        severity: 'Error',
        message: `Department ‘${displayName(dept)}’ must belong to exactly one Enterprise via HAS (found ${owningEnterpriseLinks.length}).`,
        elementId: dept.id,
        elementType: dept.type,
        collection: 'departments',
      });
    }
  }

  // 3) Business Service must map to at least one Capability.
  for (const svc of activeObjects.filter((o) => o.type === 'BusinessService')) {
    const mappedCaps = eaRelationships.filter((r) => {
      if (r.type !== 'REALIZED_BY') return false;
      if (normalizeId(r.toId) !== svc.id) return false;
      const endpoints = activeRelEndpoints(r);
      return endpoints?.from.type === 'Capability' || endpoints?.from.type === 'SubCapability';
    });

    if (mappedCaps.length === 0) {
      addRepoFinding({
        checkId: 'EA_BUSINESS_SERVICE_REQUIRES_CAPABILITY',
        severity: 'Error',
        message: `BusinessService ‘${displayName(svc)}’ must be linked to at least one Capability via REALIZED_BY.`,
        elementId: svc.id,
        elementType: svc.type,
        collection: 'businessServices',
      });
    }
  }

  // 3b) Capability must be supported by at least one ApplicationService.
  // We currently model this indirectly:
  //   Capability --REALIZED_BY--> BusinessService --SUPPORTED_BY--> ApplicationService
  // This keeps Capability->ApplicationService out of the core metamodel while still enforcing traceability.
  for (const cap of activeObjects.filter((o) => o.type === 'Capability')) {
    const realizedBusinessServiceIds = new Set<string>();
    for (const r of eaRelationships) {
      if (r.type !== 'REALIZED_BY') continue;
      if (normalizeId(r.fromId) !== cap.id) continue;
      const endpoints = activeRelEndpoints(r);
      if (!endpoints) continue;
      if (endpoints.to.type !== 'BusinessService') continue;
      realizedBusinessServiceIds.add(endpoints.to.id);
    }

    const supportingAppServiceIds = new Set<string>();
    for (const svcId of realizedBusinessServiceIds) {
      for (const r of eaRelationships) {
        if (r.type !== 'SUPPORTED_BY') continue;
        if (normalizeId(r.fromId) !== svcId) continue;
        const endpoints = activeRelEndpoints(r);
        if (!endpoints) continue;
        if (endpoints.to.type !== 'ApplicationService') continue;
        supportingAppServiceIds.add(endpoints.to.id);
      }
    }

    if (supportingAppServiceIds.size === 0) {
      addRepoFinding({
        checkId: 'EA_CAPABILITY_REQUIRES_APPLICATION_SERVICE_SUPPORT',
        severity: 'Error',
        message: `Capability ‘${displayName(cap)}’ has no supporting Application Service.`,
        elementId: cap.id,
        elementType: cap.type,
        collection: 'capabilities',
      });
    }
  }

  // 4) Application Service belongs to exactly one Application.
  for (const svc of activeObjects.filter((o) => o.type === 'ApplicationService')) {
    const providers = eaRelationships.filter((r) => {
      if (r.type !== 'PROVIDES') return false;
      if (normalizeId(r.toId) !== svc.id) return false;
      const endpoints = activeRelEndpoints(r);
      return endpoints?.from.type === 'Application';
    });

    if (providers.length !== 1) {
      addRepoFinding({
        checkId: 'EA_APPLICATION_SERVICE_REQUIRES_APPLICATION',
        severity: 'Error',
        message: `Application Service ‘${displayName(svc)}’ must belong to exactly one Application via PROVIDES (found ${providers.length}).`,
        elementId: svc.id,
        elementType: svc.type,
        collection: 'applicationServices',
      });
    }
  }

  // 5) Cross-layer rule: direct Technology ↔ Business links are forbidden.
  // Metamodel endpoint enforcement should prevent most invalid links, but governance must block any that slip in.
  for (const rel of eaRelationships) {
    const endpoints = activeRelEndpoints(rel);
    if (!endpoints) continue;

    const fromLayer = toBackendElementType(endpoints.from.type);
    const toLayer = toBackendElementType(endpoints.to.type);

    const isBusiness = (t: string) =>
      t === 'Enterprise' || t === 'Department' || t === 'Capability' || t === 'BusinessService' || t === 'BusinessProcess';
    const isTechnology = (t: string) => t === 'Technology';

    if ((isTechnology(fromLayer) && isBusiness(toLayer)) || (isBusiness(fromLayer) && isTechnology(toLayer))) {
      addRepoFinding({
        checkId: 'EA_FORBIDDEN_TECHNOLOGY_BUSINESS_LINK',
        severity: 'Error',
        message: `Forbidden cross-layer relationship: Technology must not link directly to Business (got ${endpoints.from.type} ‘${displayName(endpoints.from)}’ → ${endpoints.to.type} ‘${displayName(endpoints.to)}’ via ${rel.type}).`,
        elementId: `${normalizeId(rel.fromId)}->${normalizeId(rel.toId)}`,
        elementType: 'Relationship',
        collection: 'relationships',
      });
    }
  }

  const relationships = createRelationshipRepository(repo);
  const supportedElementIds = new Set<string>();
  for (const element of ([] as any[])
    .concat(repo.getElementsByType('enterprises'))
    .concat(repo.getElementsByType('capabilities'))
    .concat(repo.getElementsByType('businessServices'))
    .concat(repo.getElementsByType('businessProcesses'))
    .concat(repo.getElementsByType('departments'))
    .concat(repo.getElementsByType('applications'))
    .concat(repo.getElementsByType('applicationServices'))
    .concat(repo.getElementsByType('technologies'))
    .concat(repo.getElementsByType('programmes'))
    .concat(repo.getElementsByType('projects'))) {
    if (element?.id) supportedElementIds.add(String(element.id));
  }

  const invalidRelationshipInserts: string[] = [];
  for (const [i, rel] of eaRepository.relationships.entries()) {
    const sourceId = String(rel.fromId ?? '').trim();
    const targetId = String(rel.toId ?? '').trim();
    if (!sourceId || !targetId) continue;
    if (!supportedElementIds.has(sourceId) || !supportedElementIds.has(targetId)) continue;

    const sourceType = toBackendElementType(eaRepository.objects.get(sourceId)?.type ?? '');
    const targetType = toBackendElementType(eaRepository.objects.get(targetId)?.type ?? '');

    const relationshipAny: any = {
      id: `rel_${i}`,
      relationshipType: String(rel.type ?? '').trim(),
      sourceElementId: sourceId,
      sourceElementType: String(sourceType ?? '').trim(),
      targetElementId: targetId,
      targetElementType: String(targetType ?? '').trim(),
      direction: 'OUTGOING',
      status: 'Draft',
      effectiveFrom: now,
      effectiveTo: undefined,
      rationale: '',
      confidenceLevel: 'Medium',
      lastReviewedAt: now,
      reviewedBy: 'ui',
      createdAt: now,
      createdBy: 'ui',
    };

    if (
      relationshipAny.relationshipType === 'INTEGRATES_WITH' ||
      relationshipAny.relationshipType === 'CONSUMES' ||
      relationshipAny.relationshipType === 'DEPENDS_ON'
    ) {
      relationshipAny.dependencyStrength = (rel as any)?.attributes?.dependencyStrength;
      relationshipAny.dependencyType = (rel as any)?.attributes?.dependencyType;
      relationshipAny.runtimeCritical = (rel as any)?.attributes?.runtimeCritical;
    }

    const addRes = relationships.addRelationship(relationshipAny);
    if (!addRes.ok) {
      invalidRelationshipInserts.push(
        `${relationshipAny.relationshipType || '(unknown)'} ${sourceId} -> ${targetId}: ${addRes.error}`,
      );
    }
  }

  const baseRepoReport = validateArchitectureRepository(repo, nowDate);
  const repoReport: typeof baseRepoReport = (() => {
    if (extraRepoFindings.length === 0) return baseRepoReport;

    const findings = [...baseRepoReport.findings, ...(extraRepoFindings as any[])];

    const bySeverity: Record<string, number> = { ...(baseRepoReport.summary.bySeverity as any) };
    for (const f of extraRepoFindings) increment(bySeverity, String(f.severity));

    const byCheckId: Record<string, number> = { ...(baseRepoReport.summary.byCheckId as any) };
    for (const f of extraRepoFindings) increment(byCheckId, String(f.checkId));

    return {
      ...baseRepoReport,
      findings: findings as any,
      summary: {
        ...baseRepoReport.summary,
        total: findings.length,
        bySeverity: bySeverity as any,
        byCheckId: byCheckId as any,
      },
    };
  })();
  const relationshipReport = validateRelationshipRepository(repo, relationships, nowDate);

  const mandatoryFindingCount = repoReport.summary.total ?? 0;
  const relationshipErrorCount = relationshipReport.summary.bySeverity.Error ?? 0;
  const relationshipWarningCount = relationshipReport.summary.bySeverity.Warning ?? 0;
  const invalidRelationshipInsertCount = invalidRelationshipInserts.length;
  const lifecycleTagMissingCount = lifecycleTagMissingIds.length;

  return {
    summary: {
      mandatoryFindingCount,
      relationshipErrorCount,
      relationshipWarningCount,
      invalidRelationshipInsertCount,
      lifecycleTagMissingCount,
      total:
        mandatoryFindingCount +
        relationshipErrorCount +
        relationshipWarningCount +
        invalidRelationshipInsertCount +
        lifecycleTagMissingCount,
    },
    repoReport,
    relationshipReport,
    invalidRelationshipInserts,
    lifecycleTagMissingIds,
  };
}
