import React from 'react';
import { ViewLayoutStore } from '@/diagram-studio/view-runtime/ViewLayoutStore';
import { ViewStore } from '@/diagram-studio/view-runtime/ViewStore';
import type { ViewInstance } from '@/diagram-studio/viewpoints/ViewInstance';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import type {
  CatalogDomain,
  CatalogElement,
  CatalogFilters,
  CatalogQueryState,
  CatalogSortState,
} from '../types/catalog.types';
import { CATALOG_DOMAIN_TYPES } from '../types/catalog.types';

const normalize = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

const isSoftDeleted = (
  attributes: Record<string, unknown> | null | undefined,
) => Boolean((attributes as any)?._deleted);

const extractCriticality = (attributes: Record<string, unknown>) =>
  String(
    (attributes as any).criticality ??
      (attributes as any).businessCriticality ??
      (attributes as any).strategicImportance ??
      (attributes as any).obsolescenceRisk ??
      (attributes as any).vendorLockInRisk ??
      (attributes as any).technicalDebtLevel ??
      '',
  ).trim();

const getLifecycleValue = (attributes: Record<string, unknown>) =>
  String(
    (attributes as any).lifecycleState ??
      (attributes as any).lifecycleStatus ??
      '',
  ).trim();

const getStatusValue = (attributes: Record<string, unknown>) =>
  String(
    (attributes as any).approvalStatus ?? (attributes as any).status ?? '',
  ).trim();

const listDomainTypes = (domain: CatalogDomain) =>
  new Set(CATALOG_DOMAIN_TYPES[domain] ?? []);

const matchesSearch = (row: CatalogElement, query: string) => {
  if (!query) return true;
  const normalized = normalize(query);
  return (
    normalize(row.name).includes(normalized) ||
    normalize(row.elementType).includes(normalized) ||
    normalize(row.owner).includes(normalized) ||
    normalize(row.ownerRole).includes(normalized) ||
    normalize(row.lifecycle).includes(normalized) ||
    normalize(row.status).includes(normalized) ||
    normalize(row.criticality).includes(normalized) ||
    normalize(row.id).includes(normalized)
  );
};

const matchesFilters = (row: CatalogElement, filters: CatalogFilters) => {
  if (filters.type.length > 0 && !filters.type.includes(row.elementType))
    return false;
  if (
    filters.lifecycle.length > 0 &&
    !filters.lifecycle.includes(row.lifecycle)
  )
    return false;
  if (filters.owner.length > 0) {
    const ownerValue = normalize(row.owner);
    const ownerRole = normalize(row.ownerRole);
    const ok = filters.owner.some((entry) => {
      const v = normalize(entry);
      return ownerValue.includes(v) || ownerRole.includes(v);
    });
    if (!ok) return false;
  }
  if (
    filters.criticality.length > 0 &&
    !filters.criticality.includes(row.criticality)
  )
    return false;
  if (
    typeof filters.relationshipCountMin === 'number' &&
    row.relationshipsCount < filters.relationshipCountMin
  )
    return false;
  if (
    typeof filters.relationshipCountMax === 'number' &&
    row.relationshipsCount > filters.relationshipCountMax
  )
    return false;
  if (typeof filters.usedInViews === 'boolean') {
    if (filters.usedInViews && row.usedInViewsCount === 0) return false;
    if (!filters.usedInViews && row.usedInViewsCount > 0) return false;
  }
  return true;
};

const sortRows = (rows: CatalogElement[], sort: CatalogSortState) => {
  if (!sort.sortBy) return rows;
  const sortBy = sort.sortBy;
  const direction = sort.sortOrder === 'desc' ? -1 : 1;
  return [...rows].sort((left, right) => {
    const leftValue = (left as any)[sortBy] ?? '';
    const rightValue = (right as any)[sortBy] ?? '';
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return (leftValue - rightValue) * direction;
    }
    return String(leftValue).localeCompare(String(rightValue)) * direction;
  });
};

const buildViewUsage = (views: ViewInstance[]) => {
  const counts = new Map<string, number>();
  let entireRepoCount = 0;

  for (const view of views) {
    if (view.scope.kind === 'EntireRepository') {
      entireRepoCount += 1;
      continue;
    }
    const ids = new Set((view.scope.elementIds ?? []).map((id) => String(id)));
    ids.forEach((id) => {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    });
  }

  return { counts, entireRepoCount } as const;
};

export const useCatalog = (domain: CatalogDomain, query: CatalogQueryState) => {
  const { eaRepository, trySetEaRepository } = useEaRepository();

  const relationshipCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    if (!eaRepository) return counts;
    for (const rel of eaRepository.relationships) {
      counts.set(rel.fromId, (counts.get(rel.fromId) ?? 0) + 1);
      counts.set(rel.toId, (counts.get(rel.toId) ?? 0) + 1);
    }
    return counts;
  }, [eaRepository]);

  const views = React.useMemo(() => ViewStore.list(), []);

  const viewUsage = React.useMemo(() => buildViewUsage(views), [views]);

  const rows = React.useMemo<CatalogElement[]>(() => {
    if (!eaRepository) return [];
    const allowedTypes = listDomainTypes(domain);
    const results: CatalogElement[] = [];

    for (const obj of eaRepository.objects.values()) {
      if (isSoftDeleted(obj.attributes)) continue;
      if (!allowedTypes.has(obj.type)) continue;

      const attributes = obj.attributes ?? {};
      const name = String((attributes as any).name ?? '').trim() || obj.id;
      const owner = String(
        (attributes as any).ownerName ?? (attributes as any).owner ?? '',
      ).trim();
      const ownerRole = String((attributes as any).ownerRole ?? '').trim();
      const lifecycle = getLifecycleValue(attributes);
      const status = getStatusValue(attributes);
      const criticality = extractCriticality(attributes);
      const relationshipsCount = relationshipCounts.get(obj.id) ?? 0;
      const usedInViewsCount =
        (viewUsage.counts.get(obj.id) ?? 0) + viewUsage.entireRepoCount;
      const lastModifiedAt = String(
        (attributes as any).lastModifiedAt ?? '',
      ).trim();
      const createdAt = String((attributes as any).createdAt ?? '').trim();

      results.push({
        id: obj.id,
        name,
        elementType: obj.type,
        domain,
        owner,
        ownerRole,
        lifecycle,
        status,
        criticality,
        relationshipsCount,
        usedInViewsCount,
        lastModifiedAt,
        createdAt,
      });
    }

    const searched = results.filter((row) => matchesSearch(row, query.search));
    const filtered = searched.filter((row) =>
      matchesFilters(row, query.filter),
    );
    return sortRows(filtered, query.sort);
  }, [domain, eaRepository, relationshipCounts, viewUsage, query]);

  const updateElementAttributes = React.useCallback(
    (elementId: string, patch: Record<string, unknown>) => {
      if (!eaRepository)
        return { ok: false, error: 'Repository not loaded.' } as const;
      const next = eaRepository.clone();
      const updated = next.updateObjectAttributes(elementId, patch, 'merge');
      if (!updated.ok) return updated;
      const applied = trySetEaRepository(next);
      if (!applied.ok) return applied;
      try {
        window.dispatchEvent(new Event('ea:repositoryChanged'));
      } catch {
        // Best-effort only.
      }
      return { ok: true } as const;
    },
    [eaRepository, trySetEaRepository],
  );

  const removeElements = React.useCallback(
    (elementIds: string[]) => {
      if (!eaRepository)
        return { ok: false, error: 'Repository not loaded.' } as const;
      const next = eaRepository.clone();
      const idSet = new Set(elementIds.map((id) => String(id)));

      next.relationships = next.relationships.filter(
        (rel) => !idSet.has(rel.fromId) && !idSet.has(rel.toId),
      );
      idSet.forEach((id) => {
        next.objects.delete(id);
      });

      const applied = trySetEaRepository(next);
      if (!applied.ok) return applied;

      const existingViews = ViewStore.list();
      existingViews.forEach((view) => {
        if (view.scope.kind === 'ManualSelection') {
          const nextIds = view.scope.elementIds.filter(
            (id) => !idSet.has(String(id)),
          );
          if (nextIds.length !== view.scope.elementIds.length) {
            ViewStore.update(view.id, (current) => ({
              ...current,
              scope: { ...current.scope, elementIds: nextIds },
              visibleRelationshipIds: (
                current.visibleRelationshipIds ?? []
              ).filter(
                (relId) => !next.relationships.some((rel) => rel.id === relId),
              ),
            }));
          }
        }
        idSet.forEach((id) => {
          ViewLayoutStore.removeElement(view.id, id);
        });
      });

      try {
        window.dispatchEvent(new Event('ea:relationshipsChanged'));
        window.dispatchEvent(new Event('ea:viewsChanged'));
      } catch {
        // Best-effort only.
      }

      return { ok: true } as const;
    },
    [eaRepository, trySetEaRepository],
  );

  return {
    rows,
    total: rows.length,
    updateElementAttributes,
    removeElements,
  };
};
