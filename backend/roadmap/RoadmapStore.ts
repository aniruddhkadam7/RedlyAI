import type { Plateau } from './Plateau';
import { listPlateaus, getPlateauRevision } from './PlateauStore';
import type { Roadmap, RoadmapCreateRequest } from './Roadmap';

const DEFAULT_ROADMAP_ID = 'architecture-roadmap';
const roadmaps: Roadmap[] = [];
let roadmapRevision = 0;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const freezeRoadmap = (roadmap: Roadmap): Roadmap => Object.freeze(roadmap);
const generateRoadmapId = () => `roadmap-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const buildDefaultRoadmap = (): Roadmap => {
  const plateaus = listPlateaus();
  const plateauIds = plateaus.map((p) => p.id);
  const createdAt = plateaus[0]?.createdAt ?? new Date().toISOString();

  const roadmap: Roadmap = {
    id: DEFAULT_ROADMAP_ID,
    name: 'Architecture Roadmap',
    description: 'Ordered sequence of plateaus showing architectural evolution over time.',
    plateauIds,
    readOnly: true,
    createdAt,
    createdBy: 'system',
  };

  return freezeRoadmap(clone(roadmap));
};

export const getDefaultRoadmapId = () => DEFAULT_ROADMAP_ID;

export function listRoadmaps(): readonly Roadmap[] {
  return [buildDefaultRoadmap(), ...roadmaps.map((r) => freezeRoadmap(clone(r)))];
}

export function getRoadmapById(id: string): Roadmap | null {
  const key = (id ?? '').trim();
  if (!key) return null;
  if (key === DEFAULT_ROADMAP_ID) return buildDefaultRoadmap();
  const found = roadmaps.find((r) => r.id === key);
  return found ? freezeRoadmap(clone(found)) : null;
}

export function createRoadmap(request: RoadmapCreateRequest): Roadmap {
  const name = (request.name ?? '').trim();
  if (!name) {
    throw new Error('Roadmap name is required');
  }

  const plateauIds = Array.isArray(request.plateauIds)
    ? request.plateauIds.map((p) => (p ?? '').trim()).filter(Boolean)
    : [];

  if (plateauIds.length === 0) {
    throw new Error('At least one plateau must be selected');
  }

  const existing = new Set(listPlateaus().map((p) => p.id));
  for (const id of plateauIds) {
    if (!existing.has(id)) {
      throw new Error(`Plateau not found: ${id}`);
    }
  }

  const dedupedPlateauIds: string[] = [];
  const seen = new Set<string>();
  for (const id of plateauIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    dedupedPlateauIds.push(id);
  }

  const roadmap: Roadmap = {
    id: (request.id ?? generateRoadmapId()).trim() || generateRoadmapId(),
    name,
    description: request.description?.trim() || undefined,
    plateauIds: dedupedPlateauIds,
    readOnly: true,
    createdAt: new Date().toISOString(),
    createdBy: request.createdBy?.trim() || undefined,
  };

  roadmaps.push(freezeRoadmap(clone(roadmap)));
  roadmapRevision += 1;
  return freezeRoadmap(clone(roadmap));
}

export function getRoadmapRevision(): number {
  return getPlateauRevision() + roadmapRevision;
}
