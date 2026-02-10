export type RepositoryPackageManifest = {
  exportVersion: number;
  toolVersion: string;
  schemaVersion: string;
  exportDate: string;
  elementCount: number;
  relationshipCount: number;
  diagramCount: number;
  baselineCount: number;
  layoutCount: number;
  designWorkspaceCount: number;
  checksum: string;
};

export type RepositoryElementRecord = {
  id: string;
  type: string;
  name: string | null;
  properties: Record<string, unknown>;
  workspaceId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type RepositoryRelationshipRecord = {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  properties: Record<string, unknown>;
};

export type RepositoryDiagramRecord = {
  id: string;
  title: string;
  viewpointId: string;
  description?: string;
  scope?: unknown;
  referencedElementIds?: string[];
  createdAt?: string;
  createdBy?: string;
  layoutMetadata?: Record<string, unknown>;
  visibleRelationshipIds?: string[];
};

export type RepositoryLayoutsRecord = {
  viewLayouts: Record<
    string,
    Record<string, { x: number; y: number; width?: number; height?: number }>
  >;
};

export type RepositoryWorkspaceRecord = {
  schemaVersion: string;
  repositoryMetadata: Record<string, unknown>;
  repositoryId?: string;
  updatedAt?: string;
  designWorkspaces?: unknown[];
  baselines?: unknown[];
};

export type RepositoryPackageImportHistory = {
  items: unknown[];
};

export type RepositoryPackageVersionHistory = {
  items: unknown[];
};

export type RepositoryPackageData = {
  manifest: RepositoryPackageManifest;
  elements: RepositoryElementRecord[];
  relationships: RepositoryRelationshipRecord[];
  diagrams: RepositoryDiagramRecord[];
  layouts: RepositoryLayoutsRecord;
  workspace: RepositoryWorkspaceRecord;
  importHistory: RepositoryPackageImportHistory;
  versionHistory: RepositoryPackageVersionHistory;
  baselines?: RepositoryPackageBaselineRecord[];
};

export type RepositoryPackageBaselineSnapshot = {
  elements: RepositoryElementRecord[];
  relationships: RepositoryRelationshipRecord[];
  diagrams: RepositoryDiagramRecord[];
  layouts: RepositoryLayoutsRecord;
  metadata: Record<string, unknown>;
  tags?: Record<string, unknown>;
};

export type RepositoryPackageBaselineRecord = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  createdBy?: string;
  elementCount: number;
  relationshipCount: number;
  diagramCount: number;
  snapshot?: RepositoryPackageBaselineSnapshot;
};

export type RepositoryPackageSource = {
  toolVersion: string;
  schemaVersion?: string;
  exportDate?: string;
  repositoryId?: string;
  metadata: Record<string, unknown>;
  objects: Array<{
    id: string;
    type: string;
    workspaceId?: string;
    attributes: Record<string, unknown>;
  }>;
  relationships: Array<{
    id?: string;
    fromId: string;
    toId: string;
    type: string;
    attributes?: Record<string, unknown>;
  }>;
  views: Array<{
    id: string;
    name: string;
    description: string;
    viewpointId: string;
    scope: unknown;
    layoutMetadata?: Record<string, unknown>;
    createdAt: string;
    createdBy: string;
    status?: string;
    visibleRelationshipIds?: readonly string[];
  }>;
  viewLayouts: RepositoryLayoutsRecord['viewLayouts'];
  designWorkspaces: unknown[];
  baselines?: unknown[];
  importHistory?: unknown[];
  versionHistory?: unknown[];
};
