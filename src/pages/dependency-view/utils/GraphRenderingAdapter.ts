import type { ElementDefinition, LayoutOptions } from 'cytoscape';

import type { BaseArchitectureElement } from '../../../../backend/repository/BaseArchitectureElement';
import type { BaseArchitectureRelationship } from '../../../../backend/repository/BaseArchitectureRelationship';
import type { Orientation, LayoutType } from '../../../../backend/views/ViewDefinition';
import { getLifecycleStateFromAttributes } from '../../../repository/lifecycleCoveragePolicy';

export type CytoscapeGraph = {
  elements: ElementDefinition[];
  layout: LayoutOptions;
};

export type GraphRenderingAdapterInput = {
  elements: readonly BaseArchitectureElement[];
  relationships: readonly BaseArchitectureRelationship[];
  layoutType: LayoutType;
  orientation: Orientation;
};

const normalizeId = (value: string) => (value ?? '').trim();

const layoutNameFor = (layoutType: LayoutType): 'grid' | 'cose' | 'breadthfirst' => {
  switch (layoutType) {
    case 'Grid':
      return 'grid';
    case 'Force':
      return 'cose';
    case 'Hierarchical':
      return 'breadthfirst';
    case 'Layered':
      // No dagre/elk plugin in this project currently; breadthfirst is the closest built-in.
      return 'breadthfirst';
    default:
      return 'grid';
  }
};

const breadthfirstDirectionFor = (orientation: Orientation): 'rightward' | 'downward' => {
  return orientation === 'LeftToRight' ? 'rightward' : 'downward';
};

const deterministicPositions = (
  nodeIdsInOrder: readonly string[],
  orientation: Orientation,
): Readonly<Record<string, { x: number; y: number }>> => {
  // Deterministic, non-persisted initial positions to avoid any layout randomness.
  // Place nodes on a line with constant spacing; oriented by the view hint.
  const spacing = 80;
  const positions: Record<string, { x: number; y: number }> = {};
  nodeIdsInOrder.forEach((id, idx) => {
    positions[id] =
      orientation === 'LeftToRight'
        ? { x: idx * spacing, y: 0 }
        : { x: 0, y: idx * spacing };
  });
  return positions;
};

/**
 * GraphRenderingAdapter (read-only).
 *
 * Responsibilities:
 * - Transform resolved nodes/edges into Cytoscape element definitions.
 * - Map enterprise layoutType/orientation hints into Cytoscape layout options.
 *
 * Non-responsibilities:
 * - No filtering, no traversal, no repository access, no mutation.
 */
export class GraphRenderingAdapter {
  toCytoscape(input: GraphRenderingAdapterInput): CytoscapeGraph {
    const layoutName = layoutNameFor(input.layoutType);

    // Seed deterministic initial positions for any layout that may otherwise randomize.
    const orderedNodeIds = [...(input.elements ?? [])]
      .map((e) => normalizeId(e.id))
      .sort((a, b) => a.localeCompare(b));
    const seededPositions = deterministicPositions(orderedNodeIds, input.orientation);

    const nodeIds = new Set<string>();
    const nodes: ElementDefinition[] = [...(input.elements ?? [])]
      .slice()
      .sort((a, b) => normalizeId(a.id).localeCompare(normalizeId(b.id)))
      .map((e) => {
        const id = normalizeId(e.id);
        nodeIds.add(id);
        const lifecycleState = getLifecycleStateFromAttributes((e as any)?.attributes);
        return {
          data: {
            id,
            label: e.name,
            elementType: e.elementType,
            layer: e.layer,
            lifecycleState,
          },
          position: seededPositions[id],
        };
      });

    const edges: ElementDefinition[] = [...(input.relationships ?? [])]
      .slice()
      .sort((a, b) => normalizeId(a.id).localeCompare(normalizeId(b.id)))
      .map((r, index) => {
        const id = normalizeId(r.id) || `rel-${index}`;
        return {
          data: {
            id,
            source: normalizeId(r.sourceElementId),
            target: normalizeId(r.targetElementId),
            relationshipType: r.relationshipType,
          },
        };
      });

    // Adapter is filtering-free, but we defensively avoid emitting edges with missing endpoints.
    const normalizedEdges = edges.filter((e) => {
      const source = (e.data as any)?.source as string | undefined;
      const target = (e.data as any)?.target as string | undefined;
      return Boolean(source && target && nodeIds.has(source) && nodeIds.has(target));
    });

    const layout: LayoutOptions =
      layoutName === 'breadthfirst'
        ? {
            name: 'breadthfirst',
            avoidOverlap: true,
            directed: true,
            spacingFactor: 1.1,
            circle: false,
            // Cytoscape breadthfirst direction: 'LR'|'RL'|'TB'|'BT'
            direction: breadthfirstDirectionFor(input.orientation),
          }
        : layoutName === 'cose'
          ? {
              name: 'cose',
              avoidOverlap: true,
              // Determinism: do not randomize initial positions.
              randomize: false,
            }
        : {
            name: layoutName,
            avoidOverlap: true,
          };

    return {
      elements: [...nodes, ...normalizedEdges],
      layout,
    };
  }
}

export const graphRenderingAdapter = new GraphRenderingAdapter();
