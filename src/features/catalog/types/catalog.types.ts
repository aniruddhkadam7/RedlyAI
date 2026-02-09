export type CatalogDomain =
  | 'business'
  | 'application'
  | 'data'
  | 'technology'
  | 'implementation';

export const CATALOG_DOMAINS: CatalogDomain[] = [
  'business',
  'application',
  'data',
  'technology',
  'implementation',
];

export const CATALOG_DOMAIN_LABELS: Record<CatalogDomain, string> = {
  business: 'Business',
  application: 'Application',
  data: 'Data',
  technology: 'Technology',
  implementation: 'Implementation',
};

export const CATALOG_DOMAIN_TYPES: Record<CatalogDomain, string[]> = {
  business: [
    'Enterprise',
    'Capability',
    'BusinessService',
    'BusinessProcess',
    'Department',
  ],
  application: ['Application', 'ApplicationService'],
  data: ['Technology'],
  technology: ['Technology'],
  implementation: ['Programme', 'Project'],
};

export type CatalogFilters = {
  type: string[];
  lifecycle: string[];
  owner: string[];
  criticality: string[];
  relationshipCountMin?: number;
  relationshipCountMax?: number;
  usedInViews?: boolean;
};

export type CatalogSortState = {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

export type CatalogQueryState = {
  search: string;
  filter: CatalogFilters;
  sort: CatalogSortState;
};

export type CatalogElement = {
  id: string;
  name: string;
  elementType: string;
  domain: CatalogDomain;
  owner: string;
  ownerRole: string;
  lifecycle: string;
  status: string;
  criticality: string;
  relationshipsCount: number;
  usedInViewsCount: number;
  lastModifiedAt: string;
  createdAt: string;
};

export type CatalogRelationship = {
  id: string;
  relationshipType: string;
  sourceElementId: string;
  sourceElementType: string;
  targetElementId: string;
  targetElementType: string;
};

export type CatalogViewUsage = {
  id: string;
  name: string;
  viewType: string;
};

export type CatalogDetail = CatalogElement & {
  description: string;
  owningUnit: string;
  approvalStatus: string;
  createdAt: string;
  createdBy: string;
  lastModifiedBy: string;
  lifecycleStartDate: string;
  lifecycleEndDate?: string;
  relationships: CatalogRelationship[];
  views: CatalogViewUsage[];
};

export type CatalogStats = {
  total: number;
  active: number;
  draft: number;
  retired: number;
  relationshipDensity: number;
};
