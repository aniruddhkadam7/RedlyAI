import { getPlateauById } from './PlateauStore';
import type { Plateau } from './Plateau';
import { getBaselineById } from '../baselines/BaselineStore';
import type { BaseArchitectureElement } from '../repository/BaseArchitectureElement';
import type { BaseArchitectureRelationship } from '../repository/BaseArchitectureRelationship';

export type GapElementChange = {
  id: string;
  from?: BaseArchitectureElement | null;
  to?: BaseArchitectureElement | null;
};

export type GapRelationshipChange = {
  id: string;
  from?: BaseArchitectureRelationship | null;
  to?: BaseArchitectureRelationship | null;
};

export type GapResult = {
  fromPlateauId: string;
  toPlateauId: string;
  addedElements: readonly GapElementChange[];
  removedElements: readonly GapElementChange[];
  changedElements: readonly GapElementChange[];
  addedRelationships: readonly GapRelationshipChange[];
  removedRelationships: readonly GapRelationshipChange[];
  changedRelationships: readonly GapRelationshipChange[];
  warnings: readonly string[];
  computedAt: string;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const freezeResult = (result: GapResult): GapResult => Object.freeze(result);

const hashPayload = (value: unknown) => JSON.stringify(value ?? null);

const loadPlateauSnapshot = (
  plateau: Plateau | null,
): {
  elements: BaseArchitectureElement[];
  relationships: BaseArchitectureRelationship[];
  warnings: string[];
} => {
  if (!plateau) {
    return { elements: [], relationships: [], warnings: ['Plateau not found'] };
  }

  if (plateau.stateRef?.kind !== 'baseline') {
    return {
      elements: [],
      relationships: [],
      warnings: ['Plateau does not reference a baseline; cannot derive element/relationship state.'],
    };
  }

  const baseline = getBaselineById(plateau.stateRef.baselineId);
  if (!baseline) {
    return {
      elements: [],
      relationships: [],
      warnings: [`Baseline not found for plateau ${plateau.id}: ${plateau.stateRef.baselineId}`],
    };
  }

  return {
    elements: clone(baseline.elements),
    relationships: clone(baseline.relationships),
    warnings: [],
  };
};

export function computeGapBetweenPlateaus(fromPlateauId: string, toPlateauId: string): GapResult {
  const fromPlateau = getPlateauById(fromPlateauId);
  const toPlateau = getPlateauById(toPlateauId);

  const fromSnapshot = loadPlateauSnapshot(fromPlateau);
  const toSnapshot = loadPlateauSnapshot(toPlateau);

  const warnings = [...fromSnapshot.warnings, ...toSnapshot.warnings];

  const fromElements = new Map<string, BaseArchitectureElement>();
  const toElements = new Map<string, BaseArchitectureElement>();
  for (const e of fromSnapshot.elements) {
    if (e?.id) fromElements.set(String(e.id), e);
  }
  for (const e of toSnapshot.elements) {
    if (e?.id) toElements.set(String(e.id), e);
  }

  const addedElements: GapElementChange[] = [];
  const removedElements: GapElementChange[] = [];
  const changedElements: GapElementChange[] = [];

  const allElementIds = new Set<string>([...fromElements.keys(), ...toElements.keys()]);
  for (const id of allElementIds) {
    const from = fromElements.get(id) ?? null;
    const to = toElements.get(id) ?? null;
    if (from && !to) {
      removedElements.push({ id, from: clone(from), to: null });
    } else if (!from && to) {
      addedElements.push({ id, from: null, to: clone(to) });
    } else if (from && to && hashPayload(from) !== hashPayload(to)) {
      changedElements.push({ id, from: clone(from), to: clone(to) });
    }
  }

  const fromRels = new Map<string, BaseArchitectureRelationship>();
  const toRels = new Map<string, BaseArchitectureRelationship>();
  for (const r of fromSnapshot.relationships) {
    if ((r as any)?.id) fromRels.set(String((r as any).id), r);
  }
  for (const r of toSnapshot.relationships) {
    if ((r as any)?.id) toRels.set(String((r as any).id), r);
  }

  const addedRelationships: GapRelationshipChange[] = [];
  const removedRelationships: GapRelationshipChange[] = [];
  const changedRelationships: GapRelationshipChange[] = [];

  const allRelIds = new Set<string>([...fromRels.keys(), ...toRels.keys()]);
  for (const id of allRelIds) {
    const from = fromRels.get(id) ?? null;
    const to = toRels.get(id) ?? null;
    if (from && !to) {
      removedRelationships.push({ id, from: clone(from), to: null });
    } else if (!from && to) {
      addedRelationships.push({ id, from: null, to: clone(to) });
    } else if (from && to && hashPayload(from) !== hashPayload(to)) {
      changedRelationships.push({ id, from: clone(from), to: clone(to) });
    }
  }

  const result: GapResult = {
    fromPlateauId,
    toPlateauId,
    addedElements: Object.freeze(addedElements.map(clone)),
    removedElements: Object.freeze(removedElements.map(clone)),
    changedElements: Object.freeze(changedElements.map(clone)),
    addedRelationships: Object.freeze(addedRelationships.map(clone)),
    removedRelationships: Object.freeze(removedRelationships.map(clone)),
    changedRelationships: Object.freeze(changedRelationships.map(clone)),
    warnings: Object.freeze(warnings),
    computedAt: new Date().toISOString(),
  };

  return freezeResult(result);
}
