import type { BaseArchitectureRelationship } from './BaseArchitectureRelationship';

export type ApplicationDependencyType = 'Data' | 'API' | 'Batch' | 'Event';

export type ApplicationDependencyStrength = 'Hard' | 'Soft';

/**
 * Application → Application dependency relationship.
 *
 * Semantics:
 * - Typed, directional relationship for technical/operational dependency modeling.
 * - Cycles are allowed, but should be detectable.
 * - No reverse edges are implied or auto-created.
 * - No transitive dependencies are inferred.
 */
export type ApplicationDependencyRelationship = BaseArchitectureRelationship & {
  relationshipType: 'INTEGRATES_WITH';

  sourceElementType: 'Application';
  targetElementType: 'Application';

  direction: 'OUTGOING';

  dependencyType: ApplicationDependencyType;
  dependencyStrength: ApplicationDependencyStrength;
  runtimeCritical: boolean;
};

export type ApplicationDependencyCycleDetectionResult = {
  /**
   * Each cycle is a list of Application IDs in traversal order, with the first repeated at the end.
   * Example: ["appA", "appB", "appC", "appA"]
   */
  cycles: string[][];
};

/**
 * Detect cycles in a directed application dependency graph.
 *
 * Notes:
 * - Works on the explicit edges provided (no auto reverse edges).
 * - Reports cycles; does not attempt to resolve them.
 */
export function detectApplicationDependencyCycles(
  relationships: ReadonlyArray<ApplicationDependencyRelationship>,
): ApplicationDependencyCycleDetectionResult {
  const adjacency = new Map<string, string[]>();

  for (const rel of relationships) {
    const from = (rel.sourceElementId ?? '').trim();
    const to = (rel.targetElementId ?? '').trim();
    if (!from || !to) continue;

    const next = adjacency.get(from);
    if (next) next.push(to);
    else adjacency.set(from, [to]);

    // Ensure target is known as a vertex (helps traverse disconnected sinks).
    if (!adjacency.has(to)) adjacency.set(to, []);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];

  const cycleKeys = new Set<string>();
  const cycles: string[][] = [];

  const canonicalizeCycle = (cycle: string[]): string => {
    // cycle includes repeated start at end.
    const core = cycle.slice(0, -1);
    if (core.length === 0) return '';

    // Rotate so the smallest id lexicographically is first.
    let minIdx = 0;
    for (let i = 1; i < core.length; i += 1) {
      if (core[i].localeCompare(core[minIdx]) < 0) minIdx = i;
    }

    const rotated = core.slice(minIdx).concat(core.slice(0, minIdx));
    rotated.push(rotated[0]);
    return rotated.join('->');
  };

  const dfs = (node: string) => {
    visited.add(node);
    inStack.add(node);
    stack.push(node);

    const neighbors = adjacency.get(node) ?? [];
    for (const next of neighbors) {
      if (!visited.has(next)) {
        dfs(next);
        continue;
      }

      if (inStack.has(next)) {
        const idx = stack.lastIndexOf(next);
        if (idx >= 0) {
          const cycle = stack.slice(idx).concat(next);
          const key = canonicalizeCycle(cycle);
          if (key && !cycleKeys.has(key)) {
            cycleKeys.add(key);
            // Return the canonicalized cycle (as ids with repeated start).
            cycles.push(key.split('->'));
          }
        }
      }
    }

    stack.pop();
    inStack.delete(node);
  };

  for (const node of adjacency.keys()) {
    if (!visited.has(node)) dfs(node);
  }

  return { cycles };
}
