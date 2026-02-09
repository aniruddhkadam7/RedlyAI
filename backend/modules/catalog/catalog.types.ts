export type CatalogDomain =
  | 'business'
  | 'application'
  | 'data'
  | 'technology'
  | 'implementation';

export type CatalogFilter = {
  type?: string[];
  lifecycle?: string[];
  domain?: CatalogDomain[];
  owner?: string[];
  criticality?: string[];
  relationshipCountMin?: number;
  usedInViews?: boolean;
};

export type CatalogQuery = {
  domain: CatalogDomain;
  page?: number;
  pageSize?: number;
  sortBy?:
    | 'name'
    | 'elementType'
    | 'owner'
    | 'lifecycle'
    | 'criticality'
    | 'relationshipsCount'
    | 'usedInViewsCount'
    | 'lastModifiedAt';
  sortOrder?: 'asc' | 'desc';
  filter?: CatalogFilter;
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type CatalogElementSummary = {
  id: string;
  name: string;
  elementType: string;
  domain: CatalogDomain;
  owner: string;
  ownerRole: string;
  lifecycle: string;
  criticality: string;
  relationshipsCount: number;
  usedInViewsCount: number;
  lastModifiedAt: string;
};

export type CatalogRelationshipSummary = {
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

export type CatalogElementDetail = CatalogElementSummary & {
  description: string;
  owningUnit: string;
  approvalStatus: string;
  createdAt: string;
  createdBy: string;
  lastModifiedBy: string;
  lifecycleStartDate: string;
  lifecycleEndDate?: string;
  relationships: CatalogRelationshipSummary[];
  views: CatalogViewUsage[];
};

export type CatalogStats = {
  total: number;
  active: number;
  draft: number;
  retired: number;
  relationshipDensity: number;
};
