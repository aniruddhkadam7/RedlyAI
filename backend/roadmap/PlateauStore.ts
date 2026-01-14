import type { Plateau, PlateauCreateRequest } from './Plateau';

const plateaus: Plateau[] = [];
let plateauRevision = 0;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const freezePlateau = (plateau: Plateau): Plateau => Object.freeze(plateau);

const generatePlateauId = () => `plateau-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

export function createPlateau(request: PlateauCreateRequest): Plateau {
  const now = new Date();
  const occursAt = typeof request.occursAt === 'string' ? request.occursAt : request.occursAt.toISOString();
  const id = (request.id ?? generatePlateauId()).trim() || generatePlateauId();
  const name = (request.name ?? '').trim() || `Plateau ${occursAt}`;

  const plateau: Plateau = {
    id,
    name,
    description: request.description?.trim() || undefined,
    occursAt,
    stateRef: clone(request.stateRef),
    createdAt: now.toISOString(),
    createdBy: request.createdBy?.trim() || undefined,
  };

  plateaus.push(freezePlateau(clone(plateau)));
  plateauRevision += 1;
  return freezePlateau(clone(plateau));
}

export function listPlateaus(): readonly Plateau[] {
  return plateaus
    .slice()
    .sort((a, b) => a.occursAt.localeCompare(b.occursAt) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((p) => freezePlateau(clone(p)));
}

export function getPlateauById(id: string): Plateau | null {
  const key = (id ?? '').trim();
  if (!key) return null;
  const found = plateaus.find((p) => p.id === key);
  return found ? freezePlateau(clone(found)) : null;
}

export function getPlateauRevision(): number {
  return plateauRevision;
}
