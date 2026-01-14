import { createView, getViewRepository } from '../../backend/views/ViewRepositoryStore';
import type { ViewDefinition } from '../../backend/views/ViewDefinition';

const makeId = (): string => {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch {
    // ignore
  }
  return `view-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const nowIso = () => new Date().toISOString();

const upsertByName = (name: string, viewFactory: () => ViewDefinition) => {
  const repo = getViewRepository();
  const existing = repo
    .listAllViews()
    .find((v) => (v.name ?? '').trim().toLowerCase() === name.trim().toLowerCase());
  if (existing) return;

  const view = viewFactory();
  view.name = name;
  createView(view);
};

/**
 * Programme scope: seed a minimal, transformation-centric set of views.
 *
 * Notes:
 * - Views are metadata only (no repository elements are created).
 * - Best-effort: will throw if there is no active project.
 */
export function seedDefaultViewsForProgrammeScope(): void {
  getViewRepository();

  const createdAt = nowIso();

  upsertByName('Programme Impact View', () => ({
    id: makeId(),
    name: 'Programme Impact View',
    description: 'Programme-to-impacted capability/application traceability view (transformation-centric).',
    viewType: 'ImpactView',
    architectureLayer: 'CrossLayer',
    allowedElementTypes: ['Programme', 'Project', 'Capability', 'Application'],
    allowedRelationshipTypes: ['DELIVERS', 'IMPACTS', 'IMPLEMENTS'],
    layoutType: 'Layered',
    orientation: 'LeftToRight',
    scopeType: 'ENTIRE_REPOSITORY',
    scopeIds: [],
    createdBy: 'system',
    createdAt,
    lastModifiedAt: createdAt,
    approvalStatus: 'Draft',
  }));
}
