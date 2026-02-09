import type { Request, Response } from 'express';
import {
  deleteCatalogElement,
  getCatalogElement,
  getCatalogSummaryStats,
  queryCatalog,
  updateCatalogLifecycle,
} from './catalog.service';
import type {
  CatalogDomain,
  CatalogFilter,
  CatalogQuery,
} from './catalog.types';

const isCatalogDomain = (value: unknown): value is CatalogDomain => {
  if (typeof value !== 'string') return false;
  return [
    'business',
    'application',
    'data',
    'technology',
    'implementation',
  ].includes(value);
};

const parseList = (value: unknown): string[] => {
  if (Array.isArray(value))
    return value
      .map(String)
      .map((v) => v.trim())
      .filter(Boolean);
  if (typeof value === 'string')
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  return [];
};

const parseBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
};

const parseNumber = (value: unknown): number | undefined => {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const buildQuery = (req: Request, domain: CatalogDomain): CatalogQuery => {
  const filter: CatalogFilter = {
    type: parseList((req.query as any)?.type),
    lifecycle: parseList((req.query as any)?.lifecycle),
    owner: parseList((req.query as any)?.owner),
    criticality: parseList((req.query as any)?.criticality),
    relationshipCountMin: parseNumber((req.query as any)?.relationshipCountMin),
    usedInViews: parseBoolean((req.query as any)?.usedInViews),
  };

  return {
    domain,
    page: parseNumber((req.query as any)?.page) ?? 1,
    pageSize: parseNumber((req.query as any)?.pageSize) ?? 50,
    sortBy: String((req.query as any)?.sortBy ?? ''),
    sortOrder: (String((req.query as any)?.sortOrder ?? 'asc') === 'desc'
      ? 'desc'
      : 'asc') as 'asc' | 'desc',
    filter,
  };
};

export function getCatalogList(req: Request, res: Response) {
  const domainParam = (req.params as { domain?: string }).domain ?? '';
  if (!isCatalogDomain(domainParam)) {
    res
      .status(400)
      .json({ success: false, errorMessage: 'Invalid catalog domain.' });
    return;
  }

  const query = buildQuery(req, domainParam);
  const result = queryCatalog(domainParam, query);

  res.json({
    success: true,
    data: result.items,
    pagination: {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    },
  });
}

export function getCatalogStats(req: Request, res: Response) {
  const domainParam = (req.params as { domain?: string }).domain ?? '';
  if (!isCatalogDomain(domainParam)) {
    res
      .status(400)
      .json({ success: false, errorMessage: 'Invalid catalog domain.' });
    return;
  }

  const stats = getCatalogSummaryStats(domainParam);
  res.json({ success: true, data: stats });
}

export function getCatalogDetail(req: Request, res: Response) {
  const domainParam = (req.params as { domain?: string }).domain ?? '';
  const elementId = (req.params as { id?: string }).id ?? '';
  if (!isCatalogDomain(domainParam)) {
    res
      .status(400)
      .json({ success: false, errorMessage: 'Invalid catalog domain.' });
    return;
  }

  const detail = getCatalogElement(domainParam, elementId);
  if (!detail) {
    res
      .status(404)
      .json({ success: false, errorMessage: 'Element not found.' });
    return;
  }

  res.json({ success: true, data: detail });
}

export function deleteCatalogDetail(req: Request, res: Response) {
  const domainParam = (req.params as { domain?: string }).domain ?? '';
  const elementId = (req.params as { id?: string }).id ?? '';
  if (!isCatalogDomain(domainParam)) {
    res
      .status(400)
      .json({ success: false, errorMessage: 'Invalid catalog domain.' });
    return;
  }

  const cascade =
    parseBoolean((req.query as any)?.cascadeRelationships) ?? false;
  const result = deleteCatalogElement({
    domain: domainParam,
    elementId,
    cascadeRelationships: cascade,
  });
  if (!result.ok) {
    res.status(400).json({ success: false, errorMessage: result.error });
    return;
  }

  res.json({ success: true, data: result.removed });
}

export function updateCatalogLifecycleStatus(req: Request, res: Response) {
  const elementId = (req.params as { id?: string }).id ?? '';
  const lifecycleStatus = String(
    (req.body as { lifecycleStatus?: string })?.lifecycleStatus ?? '',
  ).trim();
  if (!elementId || !lifecycleStatus) {
    res.status(400).json({
      success: false,
      errorMessage: 'Element id and lifecycleStatus are required.',
    });
    return;
  }

  const result = updateCatalogLifecycle({
    elementId,
    lifecycleStatus,
    lastModifiedBy: 'catalog',
  });
  if (!result.ok) {
    res.status(400).json({ success: false, errorMessage: result.error });
    return;
  }

  res.json({ success: true, data: result.element });
}
