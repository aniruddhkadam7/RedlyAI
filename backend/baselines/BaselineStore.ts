import { readRepositorySnapshot } from '../../src/repository/repositorySnapshotStore';
import type {
  RepositoryDiagramRecord,
  RepositoryElementRecord,
  RepositoryPackageBaselineSnapshot,
  RepositoryRelationshipRecord,
} from '../services/repository/packageTypes';
import type { Baseline, BaselineCreateRequest } from './Baseline';
import { assertBaselineCreateAllowed } from './BaselineAccessControl';

const baselines: Baseline[] = [];
let baselineRevision = 0;

const BASELINES_STORAGE_KEY = 'ea.baselines.v1';
const BASELINES_CHANGED_EVENT = 'ea:baselinesChanged';

const canUseStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const notifyBaselinesChanged = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(BASELINES_CHANGED_EVENT));
  } catch {
    // Best-effort only.
  }
};

/** Persist current baselines to localStorage. */
const persistBaselines = (): void => {
  if (!canUseStorage()) return;
  try {
    const serialized = JSON.stringify(baselines);
    window.localStorage.setItem(BASELINES_STORAGE_KEY, serialized);
    notifyBaselinesChanged();
  } catch {
    // Best-effort — storage may be full.
  }
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const freezeBaseline = (baseline: Baseline): Baseline => {
  for (const e of baseline.elements) Object.freeze(e);
  for (const r of baseline.relationships) Object.freeze(r);
  Object.freeze(baseline.elements);
  Object.freeze(baseline.relationships);
  Object.freeze(baseline.source);
  Object.freeze(baseline.snapshot);
  return Object.freeze(baseline);
};

const normalizeBaseline = (baseline: Baseline): Baseline => {
  const snapshot = baseline.snapshot ?? {
    elements: baseline.elements as RepositoryElementRecord[],
    relationships: baseline.relationships as RepositoryRelationshipRecord[],
    diagrams: [],
    layouts: { viewLayouts: {} },
    metadata: {},
  };

  return {
    ...baseline,
    snapshot,
    elementCount: baseline.elementCount ?? snapshot.elements.length,
    relationshipCount:
      baseline.relationshipCount ?? snapshot.relationships.length,
    diagramCount: baseline.diagramCount ?? snapshot.diagrams.length,
  } as Baseline;
};

/** Load baselines from localStorage into memory (called once on module init). */
const loadPersistedBaselines = (): void => {
  if (!canUseStorage()) return;
  try {
    const raw = window.localStorage.getItem(BASELINES_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const normalized = parsed
      .filter((b: any) => b && typeof b.id === 'string')
      .map((b: any) => normalizeBaseline(clone(b)))
      .map(freezeBaseline);
    baselines.splice(0, baselines.length, ...normalized);
    baselineRevision += 1;
  } catch {
    // Ignore corrupt data.
  }
};

// Auto-load persisted baselines on module initialization.
loadPersistedBaselines();

const generateBaselineId = () =>
  `baseline-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const validateSnapshot = (
  snapshot: RepositoryPackageBaselineSnapshot,
): string | null => {
  const elementIds = new Set(snapshot.elements.map((e) => e.id));
  const relationshipIds = new Set<string>();
  const diagramIds = new Set(snapshot.diagrams.map((d) => d.id));

  for (const rel of snapshot.relationships) {
    if (relationshipIds.has(rel.id))
      return `Duplicate relationship id: ${rel.id}`;
    relationshipIds.add(rel.id);
    if (!elementIds.has(rel.sourceId))
      return `Relationship references missing source element: ${rel.sourceId}`;
    if (!elementIds.has(rel.targetId))
      return `Relationship references missing target element: ${rel.targetId}`;
  }

  for (const diagram of snapshot.diagrams) {
    if (!diagram.id) return 'Diagram id is required.';
    if (diagram.referencedElementIds) {
      for (const elementId of diagram.referencedElementIds) {
        if (!elementIds.has(elementId)) {
          return `Diagram references missing element: ${elementId}`;
        }
      }
    }
    if (diagram.visibleRelationshipIds) {
      for (const relId of diagram.visibleRelationshipIds) {
        if (!relationshipIds.has(relId)) {
          return `Diagram references missing relationship: ${relId}`;
        }
      }
    }
  }

  const layouts = snapshot.layouts?.viewLayouts ?? {};
  for (const viewId of Object.keys(layouts)) {
    if (!diagramIds.has(viewId))
      return `Layout references missing diagram: ${viewId}`;
    const positions = layouts[viewId] ?? {};
    for (const elementId of Object.keys(positions)) {
      if (!elementIds.has(elementId)) {
        return `Layout references missing element: ${elementId}`;
      }
    }
  }

  return null;
};

export function createBaseline(request: BaselineCreateRequest): Baseline {
  assertBaselineCreateAllowed(request.createdBy);

  const now = request.createdAt ? new Date(request.createdAt) : new Date();
  const id =
    (request.id ?? generateBaselineId()).trim() || generateBaselineId();
  const name = (request.name ?? '').trim() || `Baseline ${now.toISOString()}`;

  const repositorySnapshot = readRepositorySnapshot();
  if (!repositorySnapshot) {
    throw new Error('Repository snapshot not available.');
  }

  const elements: RepositoryElementRecord[] = repositorySnapshot.objects.map(
    (obj) => ({
      id: obj.id,
      type: obj.type,
      name:
        typeof (obj.attributes as any)?.name === 'string'
          ? String((obj.attributes as any).name)
          : null,
      properties: { ...(obj.attributes ?? {}) },
      workspaceId: obj.workspaceId,
    }),
  );

  const relationships: RepositoryRelationshipRecord[] =
    repositorySnapshot.relationships.map((rel) => ({
      id:
        typeof rel.id === 'string' && rel.id.trim()
          ? rel.id
          : `rel-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      sourceId: rel.fromId,
      targetId: rel.toId,
      type: rel.type,
      properties: { ...(rel.attributes ?? {}) },
    }));

  const diagrams: RepositoryDiagramRecord[] = (
    repositorySnapshot.views ?? []
  ).map((view) => ({
    id: view.id,
    title: view.name,
    viewpointId: view.viewpointId,
    description: view.description,
    scope: view.scope,
    referencedElementIds: Array.isArray((view as any)?.scope?.elementIds)
      ? (view as any).scope.elementIds.map((id: unknown) => String(id))
      : [],
    createdAt: view.createdAt,
    createdBy: view.createdBy,
    layoutMetadata: view.layoutMetadata
      ? { ...view.layoutMetadata }
      : undefined,
    visibleRelationshipIds: Array.isArray(view.visibleRelationshipIds)
      ? [...view.visibleRelationshipIds]
      : undefined,
  }));

  const layouts = {
    viewLayouts: repositorySnapshot.studioState?.viewLayouts ?? {},
  };

  const snapshot: RepositoryPackageBaselineSnapshot = {
    elements,
    relationships,
    diagrams,
    layouts,
    metadata: { ...(repositorySnapshot.metadata as any) },
  };

  const validationError = validateSnapshot(snapshot);
  if (validationError) {
    throw new Error(validationError);
  }

  const baseline: Baseline = {
    id,
    name,
    description: request.description?.trim() || undefined,
    createdAt: now.toISOString(),
    createdBy: request.createdBy?.trim() || undefined,
    source: {
      elementsRevision: elements.length,
      relationshipsRevision: relationships.length,
    },
    snapshot,
    elementCount: elements.length,
    relationshipCount: relationships.length,
    diagramCount: diagrams.length,
    elements,
    relationships,
  };

  baselines.push(freezeBaseline(clone(baseline)));
  baselineRevision += 1;
  persistBaselines();
  return freezeBaseline(clone(baseline));
}

export function listBaselines(): readonly Baseline[] {
  return baselines.map((b) => clone(b)).map(freezeBaseline);
}

export function getBaselineById(id: string): Baseline | null {
  const key = (id ?? '').trim();
  if (!key) return null;
  const found = baselines.find((b) => b.id === key);
  return found ? freezeBaseline(clone(found)) : null;
}

export function getBaselineRevision(): number {
  return baselineRevision;
}

export function replaceBaselines(next: Baseline[]): void {
  const normalized = next.map((b) => normalizeBaseline(clone(b)));
  baselines.splice(
    0,
    baselines.length,
    ...normalized.map((b) => freezeBaseline(b)),
  );
  baselineRevision += 1;
  persistBaselines();
}
