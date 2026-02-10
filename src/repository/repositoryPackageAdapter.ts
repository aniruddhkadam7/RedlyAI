import type { ViewInstance } from '@/diagram-studio/viewpoints/ViewInstance';
import type { RepositorySnapshot } from '@/repository/repositorySnapshotStore';
import type { RepositoryPackageData } from '../../backend/services/repository/packageTypes';

const toViewInstance = (
  diagram: RepositoryPackageData['diagrams'][number],
): ViewInstance => ({
  id: diagram.id,
  name: diagram.title,
  description: diagram.description ?? '',
  viewpointId: diagram.viewpointId,
  scope: (diagram.scope as any) ?? { kind: 'EntireRepository' },
  layoutMetadata: diagram.layoutMetadata ?? {},
  createdAt: diagram.createdAt ?? new Date().toISOString(),
  createdBy: diagram.createdBy ?? 'import',
  status: 'SAVED',
  visibleRelationshipIds: diagram.visibleRelationshipIds,
});

export const buildSnapshotFromPackage = (
  pkg: RepositoryPackageData,
): RepositorySnapshot => {
  const metadata = pkg.workspace.repositoryMetadata as any;

  const views = pkg.diagrams.map(toViewInstance);
  const studioState = {
    viewLayouts: pkg.layouts.viewLayouts ?? {},
    designWorkspaces: (pkg.workspace.designWorkspaces as any[]) ?? [],
  };

  return {
    version: 1,
    metadata,
    objects: pkg.elements.map((el) => ({
      id: el.id,
      type: el.type as any,
      workspaceId: el.workspaceId,
      attributes: { ...(el.properties ?? {}) },
    })),
    relationships: pkg.relationships.map((rel) => ({
      id: rel.id,
      fromId: rel.sourceId,
      toId: rel.targetId,
      type: rel.type as any,
      attributes: { ...(rel.properties ?? {}) },
    })),
    views,
    studioState,
    importHistory: pkg.importHistory?.items ?? [],
    versionHistory: pkg.versionHistory?.items ?? [],
    updatedAt: pkg.manifest.exportDate,
  };
};

export const buildLegacyPayloadFromPackage = (pkg: RepositoryPackageData) => {
  const snapshot = buildSnapshotFromPackage(pkg);
  const metadata = pkg.workspace.repositoryMetadata as any;

  return {
    version: 1 as const,
    meta: {
      createdAt: metadata?.createdAt,
      updatedAt: new Date().toISOString(),
      repositoryId: pkg.workspace.repositoryId ?? undefined,
      repositoryName: metadata?.repositoryName ?? 'Repository',
      organizationName: metadata?.organizationName ?? '',
      referenceFramework: metadata?.referenceFramework ?? 'Custom',
      timeHorizon: metadata?.timeHorizon ?? 'Current',
    },
    repository: {
      metadata,
      metamodel: metadata?.frameworkConfig ?? null,
      snapshot,
    },
    views: { items: snapshot.views ?? [] },
    studioState: {
      viewLayouts: snapshot.studioState?.viewLayouts ?? {},
      designWorkspaces: snapshot.studioState?.designWorkspaces ?? [],
    },
  };
};
