import type { Baseline, BaselineCreateRequest } from './Baseline';
import type { ArchitectureRepository, RepositoryCollectionType } from '../repository/ArchitectureRepository';
import type { BaseArchitectureElement } from '../repository/BaseArchitectureElement';
import type { BaseArchitectureRelationship } from '../repository/BaseArchitectureRelationship';
import type { RelationshipRepository } from '../repository/RelationshipRepository';
import { getRepository, getRepositoryRevision } from '../repository/RepositoryStore';
import { getRelationshipRepository, getRelationshipRepositoryRevision } from '../repository/RelationshipRepositoryStore';
import { assertBaselineCreateAllowed } from './BaselineAccessControl';

const COLLECTIONS: RepositoryCollectionType[] = [
  'enterprises',
  'capabilities',
  'businessServices',
  'businessProcesses',
  'departments',
  'applications',
  'applicationServices',
  'technologies',
  'programmes',
  'projects',
];

const baselines: Baseline[] = [];
let baselineRevision = 0;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const freezeBaseline = (baseline: Baseline): Baseline => {
  baseline.elements.forEach((e) => Object.freeze(e));
  baseline.relationships.forEach((r) => Object.freeze(r));
  Object.freeze(baseline.elements);
  Object.freeze(baseline.relationships);
  Object.freeze(baseline.source);
  return Object.freeze(baseline);
};

const snapshotElements = (repo: ArchitectureRepository): BaseArchitectureElement[] => {
  const all: BaseArchitectureElement[] = [];
  for (const collection of COLLECTIONS) {
    const items = repo.getElementsByType(collection) as BaseArchitectureElement[];
    items.forEach((item) => all.push(clone(item)));
  }
  return all;
};

const snapshotRelationships = (relRepo: RelationshipRepository): BaseArchitectureRelationship[] => {
  return relRepo.getAllRelationships().map((r) => clone(r));
};

const generateBaselineId = () => `baseline-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

export function createBaseline(request: BaselineCreateRequest): Baseline {
  assertBaselineCreateAllowed(request.createdBy);

  const now = request.createdAt ? new Date(request.createdAt) : new Date();
  const id = (request.id ?? generateBaselineId()).trim() || generateBaselineId();
  const name = (request.name ?? '').trim() || `Baseline ${now.toISOString()}`;

  const repo = getRepository();
  const relRepo = getRelationshipRepository();

  const baseline: Baseline = {
    id,
    name,
    description: request.description?.trim() || undefined,
    createdAt: now.toISOString(),
    createdBy: request.createdBy?.trim() || undefined,
    source: {
      elementsRevision: getRepositoryRevision(),
      relationshipsRevision: getRelationshipRepositoryRevision(),
    },
    elements: snapshotElements(repo),
    relationships: snapshotRelationships(relRepo),
  };

  baselines.push(freezeBaseline(clone(baseline)));
  baselineRevision += 1;
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
