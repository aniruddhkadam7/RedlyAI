import {
  getRelationshipRepository,
  removeRelationshipsForElement,
} from '../../repository/RelationshipRepositoryStore';
import {
  removeElement,
  updateElementLifecycle,
} from '../../repository/RepositoryStore';
import {
  getCatalogDetail,
  getCatalogStats,
  listCatalogElements,
} from './catalog.repository';
import type {
  CatalogDomain,
  CatalogFilter,
  CatalogQuery,
  CatalogStats,
  PaginatedResult,
} from './catalog.types';

const DEFAULT_PAGE_SIZE = 50;

const normalizeSort = (value?: string): string =>
  typeof value === 'string' ? value : '';

const compareValues = (a: string | number, b: string | number) => {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
};

const sortSummaries = (
  items: ReturnType<typeof listCatalogElements>,
  sortBy: string,
  order: 'asc' | 'desc',
) => {
  if (!sortBy) return items;
  const direction = order === 'desc' ? -1 : 1;
  return [...items].sort((left, right) => {
    const leftValue = (left as any)[sortBy] ?? '';
    const rightValue = (right as any)[sortBy] ?? '';
    return compareValues(leftValue, rightValue) * direction;
  });
};

export function queryCatalog(
  domain: CatalogDomain,
  query: CatalogQuery,
): PaginatedResult<ReturnType<typeof listCatalogElements>[number]> {
  const filter: CatalogFilter | undefined = query.filter;
  const items = listCatalogElements(domain, filter);

  const sortBy = normalizeSort(query.sortBy);
  const sortOrder = query.sortOrder ?? 'asc';
  const sorted = sortSummaries(items, sortBy, sortOrder);

  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.max(1, Math.floor(query.pageSize ?? DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;
  const paged = sorted.slice(offset, offset + pageSize);

  return {
    items: paged,
    total: sorted.length,
    page,
    pageSize,
  };
}

export function getCatalogSummaryStats(domain: CatalogDomain): CatalogStats {
  return getCatalogStats(domain);
}

export function getCatalogElement(domain: CatalogDomain, elementId: string) {
  return getCatalogDetail(domain, elementId);
}

export function deleteCatalogElement(args: {
  domain: CatalogDomain;
  elementId: string;
  cascadeRelationships?: boolean;
}) {
  const detail = getCatalogDetail(args.domain, args.elementId);
  if (!detail) return { ok: false, error: 'Element not found.' } as const;

  const relationships = getRelationshipRepository().getRelationshipsForElement(
    args.elementId,
  );
  if (relationships.length > 0 && !args.cascadeRelationships) {
    return {
      ok: false,
      error: 'Element has relationships. Enable cascade to delete.',
    } as const;
  }

  if (args.cascadeRelationships) {
    removeRelationshipsForElement(args.elementId);
  }

  const removed = removeElement(args.elementId);
  if (!removed.ok) return { ok: false, error: removed.error } as const;

  return { ok: true, removed: detail } as const;
}

export function updateCatalogLifecycle(args: {
  elementId: string;
  lifecycleStatus: string;
  lastModifiedBy?: string;
}) {
  const updated = updateElementLifecycle(args.elementId, {
    lifecycleStatus: args.lifecycleStatus,
    lastModifiedBy: args.lastModifiedBy ?? 'catalog',
  });
  if (!updated.ok) return { ok: false, error: updated.error } as const;
  return { ok: true, element: updated.element } as const;
}
