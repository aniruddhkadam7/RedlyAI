import type { ObjectType } from '@/pages/dependency-view/utils/eaMetaModel';

import type { LifecycleCoverage } from './repositoryMetadata';

export type LifecycleState = 'As-Is' | 'To-Be';

const TO_BE_OBJECT_TYPES: ReadonlySet<ObjectType> = new Set(['Programme', 'Project']);

export const isToBeObjectType = (type: ObjectType): boolean => {
  return TO_BE_OBJECT_TYPES.has(type);
};

export const isRoadmapAllowedForLifecycleCoverage = (
  lifecycleCoverage: LifecycleCoverage | null | undefined,
): boolean => {
  return lifecycleCoverage !== 'As-Is';
};

export const isGapAnalysisAllowedForLifecycleCoverage = (
  lifecycleCoverage: LifecycleCoverage | null | undefined,
): boolean => {
  // Gap analysis needs an As-Is baseline.
  return lifecycleCoverage !== 'To-Be';
};

export const defaultLifecycleStateForLifecycleCoverage = (
  lifecycleCoverage: LifecycleCoverage | null | undefined,
): LifecycleState => {
  if (lifecycleCoverage === 'To-Be') return 'To-Be';
  return 'As-Is';
};

export const getLifecycleStateFromAttributes = (
  attributes: Record<string, unknown> | null | undefined,
): LifecycleState | null => {
  const raw = attributes?.lifecycleState;
  if (raw === 'As-Is' || raw === 'To-Be') return raw;

  // TOGAF compatibility: treat Baseline/Target as As-Is/To-Be for lifecycle coverage filtering/governance.
  if (raw === 'Baseline') return 'As-Is';
  if (raw === 'Target') return 'To-Be';
  return null;
};

export const isObjectVisibleForLifecycleCoverage = (
  lifecycleCoverage: LifecycleCoverage | null | undefined,
  attributes: Record<string, unknown> | null | undefined,
): boolean => {
  const state = getLifecycleStateFromAttributes(attributes);

  if (lifecycleCoverage === 'As-Is') {
    // In As-Is only mode, hide explicitly To-Be objects.
    return state !== 'To-Be';
  }

  if (lifecycleCoverage === 'To-Be') {
    // In To-Be only mode, hide explicitly As-Is objects.
    // Missing state is treated as To-Be to avoid blank workspaces for legacy repositories.
    return state !== 'As-Is';
  }

  // Both: show everything.
  return true;
};

export const canCreateObjectTypeForLifecycleCoverage = (
  lifecycleCoverage: LifecycleCoverage | null | undefined,
  type: ObjectType,
): { ok: true } | { ok: false; reason: string } => {
  if (lifecycleCoverage === 'As-Is' && isToBeObjectType(type)) {
    return {
      ok: false,
      reason:
        "Lifecycle Coverage is 'As-Is': To-Be elements (Programmes/Projects) are disabled. Change Lifecycle Coverage to 'To-Be' or 'Both' to create them.",
    };
  }
  return { ok: true };
};
