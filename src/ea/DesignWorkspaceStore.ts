import type { ObjectType, RelationshipType } from '@/pages/dependency-view/utils/eaMetaModel';

export type DesignWorkspaceStatus = 'DRAFT' | 'COMMITTED' | 'DISCARDED';

export type ModelingState = 'DRAFT' | 'COMMITTED' | 'REVIEW_READY' | 'APPROVED';

export type DesignWorkspaceMode = 'STANDARD' | 'ITERATIVE';

export type DesignWorkspaceScope = 'Enterprise' | 'Capability' | 'Application';

export type DesignWorkspaceLayoutNode = {
  id: string;
  label: string;
  elementType: ObjectType;
  x: number;
  y: number;
};

export type DesignWorkspaceLayoutEdge = {
  id: string;
  source: string;
  target: string;
  relationshipType: RelationshipType;
};

export type DesignWorkspaceLayout = {
  nodes: DesignWorkspaceLayoutNode[];
  edges: DesignWorkspaceLayoutEdge[];
};

export type DesignWorkspaceStagedElement = {
  id: string;
  kind: 'element';
  type: ObjectType;
  name: string;
  description?: string;
  attributes?: Record<string, unknown>;
  createdAt: string;
  createdBy?: string;
  modelingState: ModelingState;
  status: 'STAGED' | 'COMMITTED' | 'DISCARDED';
};

export type DesignWorkspaceStagedRelationship = {
  id: string;
  kind: 'relationship';
  type: RelationshipType;
  fromId: string;
  toId: string;
  attributes?: Record<string, unknown>;
  createdAt: string;
  createdBy?: string;
  modelingState: ModelingState;
  status: 'STAGED' | 'COMMITTED' | 'DISCARDED';
};

export type DesignWorkspace = {
  id: string;
  repositoryName: string;
  name: string;
  description?: string;
  scope?: DesignWorkspaceScope;
  mode?: DesignWorkspaceMode;
  status: DesignWorkspaceStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  repositoryUpdatedAt?: string;
  layout?: DesignWorkspaceLayout;
  stagedElements: DesignWorkspaceStagedElement[];
  stagedRelationships: DesignWorkspaceStagedRelationship[];
};

const storageKeyForRepo = (repositoryName: string) => `ea.designWorkspaces.${repositoryName}`;

const safeRepositoryName = (repositoryName: string) => (repositoryName || 'default').trim() || 'default';

const readWorkspaces = (repositoryName: string): DesignWorkspace[] => {
  const key = storageKeyForRepo(safeRepositoryName(repositoryName));
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DesignWorkspace[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((w) => w && typeof w.id === 'string')
      .map((w) => {
        const stagedElements = Array.isArray(w.stagedElements)
          ? w.stagedElements.map((el) => ({
            ...el,
            attributes: (el as any)?.attributes ?? {},
            modelingState: (el as any)?.modelingState ?? 'DRAFT',
          }))
          : [];
        const stagedRelationships = Array.isArray(w.stagedRelationships)
          ? w.stagedRelationships.map((rel) => ({
            ...rel,
            attributes: (rel as any)?.attributes ?? {},
            modelingState: (rel as any)?.modelingState ?? 'DRAFT',
          }))
          : [];
        const layoutNodes = Array.isArray(w.layout?.nodes) ? w.layout?.nodes ?? [] : [];
        const layoutEdges = Array.isArray(w.layout?.edges) ? w.layout?.edges ?? [] : [];
        return {
          ...w,
          status: (w.status as DesignWorkspaceStatus) ?? 'DRAFT',
          createdBy: (w.createdBy ?? 'unknown') as string,
          mode: (w as any)?.mode ?? 'STANDARD',
          stagedElements,
          stagedRelationships,
          layout: { nodes: layoutNodes, edges: layoutEdges },
        } as DesignWorkspace;
      });
  } catch {
    return [];
  }
};

const writeWorkspaces = (repositoryName: string, items: DesignWorkspace[]) => {
  const key = storageKeyForRepo(safeRepositoryName(repositoryName));
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Best-effort only.
  }
};

export const DesignWorkspaceStore = {
  list(repositoryName: string): DesignWorkspace[] {
    return readWorkspaces(repositoryName).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  },

  replaceAll(repositoryName: string, items: DesignWorkspace[]): void {
    writeWorkspaces(repositoryName, Array.isArray(items) ? items : []);
  },

  get(repositoryName: string, id: string): DesignWorkspace | undefined {
    return readWorkspaces(repositoryName).find((w) => w.id === id);
  },

  save(repositoryName: string, workspace: DesignWorkspace): DesignWorkspace {
    const existing = readWorkspaces(repositoryName);
    const next = new Map(existing.map((w) => [w.id, w] as const));
    next.set(workspace.id, { ...workspace, repositoryName: safeRepositoryName(repositoryName) });
    const merged = Array.from(next.values());
    writeWorkspaces(repositoryName, merged);
    return workspace;
  },

  remove(repositoryName: string, workspaceId: string): void {
    const existing = readWorkspaces(repositoryName);
    const filtered = existing.filter((w) => w.id !== workspaceId);
    writeWorkspaces(repositoryName, filtered);
  },
};
