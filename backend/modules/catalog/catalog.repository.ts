import type { RepositoryCollectionType } from '../../repository/ArchitectureRepository';
import type { BaseArchitectureElement } from '../../repository/BaseArchitectureElement';
import { getRelationshipRepository } from '../../repository/RelationshipRepositoryStore';
import { getRepository } from '../../repository/RepositoryStore';
import type { ViewDefinition } from '../../views/ViewDefinition';
import { getViewRepository } from '../../views/ViewRepositoryStore';
import type {
  CatalogDomain,
  CatalogElementDetail,
  CatalogElementSummary,
  CatalogFilter,
  CatalogRelationshipSummary,
  CatalogStats,
  CatalogViewUsage,
} from './catalog.types';

const DOMAIN_COLLECTIONS: Record<CatalogDomain, RepositoryCollectionType[]> = {
  business: [
    'enterprises',
    'capabilities',
    'businessServices',
    'businessProcesses',
    'departments',
  ],
  application: ['applications', 'applicationServices'],
  data: ['technologies'],
  technology: ['technologies'],
  implementation: ['programmes', 'projects'],
};

const DEFAULT_DOMAIN: CatalogDomain = 'business';

const normalize = (value: string) => value.trim().toLowerCase();

const toStringValue = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const extractCriticality = (element: BaseArchitectureElement): string => {
  const raw =
    (element as any).businessCriticality ??
    (element as any).strategicImportance ??
    (element as any).obsolescenceRisk ??
    (element as any).vendorLockInRisk ??
    (element as any).technicalDebtLevel ??
    '';
  return typeof raw === 'string' ? raw : '';
};

const resolveDomainForElement = (
  element: BaseArchitectureElement,
): CatalogDomain => {
  if (element.layer === 'Business') return 'business';
  if (element.layer === 'Application') return 'application';
  if (element.layer === 'Implementation & Migration') return 'implementation';
  if (element.layer === 'Technology') return 'technology';
  return DEFAULT_DOMAIN;
};

const lifecycleMatches = (
  element: BaseArchitectureElement,
  values: string[],
) => {
  if (values.length === 0) return true;
  const normalized = normalize(element.lifecycleStatus ?? '');
  const mapped = values.map((value) => {
    const v = normalize(value);
    if (v === 'draft') return 'planned';
    return v;
  });
  return mapped.includes(normalized);
};

const getElementsForDomain = (
  domain: CatalogDomain,
): BaseArchitectureElement[] => {
  const repo = getRepository();
  const types =
    DOMAIN_COLLECTIONS[domain] ?? DOMAIN_COLLECTIONS[DEFAULT_DOMAIN];
  const elements: BaseArchitectureElement[] = [];

  for (const type of types) {
    elements.push(...repo.getElementsByType(type));
  }

  if (domain !== 'data') return elements;

  return elements.filter((element) => {
    const category = normalize(
      String((element as any).technologyCategory ?? ''),
    );
    return (
      category === 'storage' || category === 'database' || category === 'data'
    );
  });
};

const buildRelationshipCountIndex = () => {
  const repo = getRelationshipRepository();
  const counts = new Map<string, number>();
  for (const rel of repo.getAllRelationships()) {
    const source = rel.sourceElementId;
    const target = rel.targetElementId;
    counts.set(source, (counts.get(source) ?? 0) + 1);
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return counts;
};

const buildViewUsageIndex = (views: ViewDefinition[]) => {
  const counts = new Map<string, number>();
  for (const view of views) {
    const ids = new Set<string>();
    if (view.rootElementId) ids.add(view.rootElementId);
    for (const id of view.scopeIds ?? []) {
      if (id) ids.add(id);
    }
    for (const id of ids) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
};

const buildViewUsageList = (
  views: ViewDefinition[],
  elementId: string,
): CatalogViewUsage[] => {
  const usage: CatalogViewUsage[] = [];
  for (const view of views) {
    const hasRoot = view.rootElementId === elementId;
    const hasScope = (view.scopeIds ?? []).includes(elementId);
    if (hasRoot || hasScope) {
      usage.push({ id: view.id, name: view.name, viewType: view.viewType });
    }
  }
  usage.sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  return usage;
};

const matchesOwner = (element: BaseArchitectureElement, owners: string[]) => {
  if (owners.length === 0) return true;
  const ownerName = normalize(element.ownerName ?? '');
  const ownerRole = normalize(element.ownerRole ?? '');
  return owners.some((value) => {
    const match = normalize(value);
    return ownerName.includes(match) || ownerRole.includes(match);
  });
};

const matchesCriticality = (
  element: BaseArchitectureElement,
  values: string[],
) => {
  if (values.length === 0) return true;
  const criticality = normalize(extractCriticality(element));
  return values.map(normalize).includes(criticality);
};

const matchesType = (element: BaseArchitectureElement, types: string[]) => {
  if (types.length === 0) return true;
  return types.map(normalize).includes(normalize(element.elementType ?? ''));
};

const matchesRelationshipCount = (count: number, minValue?: number) => {
  if (typeof minValue !== 'number' || Number.isNaN(minValue)) return true;
  return count > minValue;
};

const matchesUsedInViews = (count: number, flag?: boolean) => {
  if (typeof flag !== 'boolean') return true;
  return flag ? count > 0 : count === 0;
};

const toSummary = (
  element: BaseArchitectureElement,
  args: {
    relationshipCount: number;
    usedInViewsCount: number;
  },
): CatalogElementSummary => ({
  id: element.id,
  name: element.name,
  elementType: element.elementType,
  domain: resolveDomainForElement(element),
  owner: element.ownerName,
  ownerRole: element.ownerRole,
  lifecycle: element.lifecycleStatus,
  criticality: extractCriticality(element),
  relationshipsCount: args.relationshipCount,
  usedInViewsCount: args.usedInViewsCount,
  lastModifiedAt: element.lastModifiedAt,
});

export function listCatalogElements(
  domain: CatalogDomain,
  filter?: CatalogFilter,
): CatalogElementSummary[] {
  const elements = getElementsForDomain(domain);
  const relationshipsCount = buildRelationshipCountIndex();
  const views = getViewRepository().listAllViews();
  const viewUsage = buildViewUsageIndex(views);

  const typeFilter = filter?.type ?? [];
  const lifecycleFilter = filter?.lifecycle ?? [];
  const ownerFilter = filter?.owner ?? [];
  const criticalityFilter = filter?.criticality ?? [];
  const relationshipMin = filter?.relationshipCountMin;
  const usedInViews = filter?.usedInViews;

  const results: CatalogElementSummary[] = [];

  for (const element of elements) {
    const relationshipCount = relationshipsCount.get(element.id) ?? 0;
    const usedCount = viewUsage.get(element.id) ?? 0;

    if (!matchesType(element, typeFilter)) continue;
    if (!lifecycleMatches(element, lifecycleFilter)) continue;
    if (!matchesOwner(element, ownerFilter)) continue;
    if (!matchesCriticality(element, criticalityFilter)) continue;
    if (!matchesRelationshipCount(relationshipCount, relationshipMin)) continue;
    if (!matchesUsedInViews(usedCount, usedInViews)) continue;

    results.push(
      toSummary(element, { relationshipCount, usedInViewsCount: usedCount }),
    );
  }

  return results;
}

export function getCatalogDetail(
  domain: CatalogDomain,
  elementId: string,
): CatalogElementDetail | null {
  const elements = getElementsForDomain(domain);
  const element = elements.find((item) => item.id === elementId) ?? null;
  if (!element) return null;

  const relationshipRepo = getRelationshipRepository();
  const relationships = relationshipRepo.getRelationshipsForElement(elementId);
  const views = getViewRepository().listAllViews();
  const viewUsage = buildViewUsageList(views, elementId);

  const relationshipSummaries: CatalogRelationshipSummary[] = relationships.map(
    (rel) => ({
      id: rel.id,
      relationshipType: rel.relationshipType,
      sourceElementId: rel.sourceElementId,
      sourceElementType: rel.sourceElementType,
      targetElementId: rel.targetElementId,
      targetElementType: rel.targetElementType,
    }),
  );

  const summary = toSummary(element, {
    relationshipCount: relationships.length,
    usedInViewsCount: viewUsage.length,
  });

  return {
    ...summary,
    description: toStringValue(element.description),
    owningUnit: toStringValue(element.owningUnit),
    approvalStatus: toStringValue(element.approvalStatus),
    createdAt: toStringValue(element.createdAt),
    createdBy: toStringValue(element.createdBy),
    lastModifiedBy: toStringValue(element.lastModifiedBy),
    lifecycleStartDate: toStringValue(element.lifecycleStartDate),
    lifecycleEndDate: toStringValue(element.lifecycleEndDate),
    relationships: relationshipSummaries,
    views: viewUsage,
  };
}

export function getCatalogStats(domain: CatalogDomain): CatalogStats {
  const elements = getElementsForDomain(domain);
  const relationshipsCount = buildRelationshipCountIndex();

  let active = 0;
  let draft = 0;
  let retired = 0;
  let relationshipTotal = 0;

  for (const element of elements) {
    const lifecycle = normalize(element.lifecycleStatus ?? '');
    if (lifecycle === 'active') active += 1;
    if (lifecycle === 'planned' || lifecycle === 'draft') draft += 1;
    if (lifecycle === 'retired') retired += 1;
    relationshipTotal += relationshipsCount.get(element.id) ?? 0;
  }

  const total = elements.length;
  const density = total > 0 ? relationshipTotal / total : 0;

  return {
    total,
    active,
    draft,
    retired,
    relationshipDensity: Number(density.toFixed(2)),
  };
}
