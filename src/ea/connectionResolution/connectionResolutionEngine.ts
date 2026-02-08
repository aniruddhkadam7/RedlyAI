/**
 * Connection Resolution Engine
 *
 * Core engine that resolves how any two EA elements can be connected.
 * Replaces rule-first validation with a user-first resolution pipeline:
 *
 *   1) Direct relationships — check RELATIONSHIP_TYPE_DEFINITIONS
 *   2) Indirect paths (max depth 2) — walk through intermediate element types
 *   3) Canonical preference — Capability→Function→Service paths rank highest
 *   4) Auto-create — when exactly one unambiguous direct relationship exists
 *   5) Chooser — when multiple valid options (direct or indirect) exist
 *
 * NEVER shows errors during drag. Errors are surfaced ONLY when no path exists.
 */

import {
  type ObjectType,
  type RelationshipType,
  RELATIONSHIP_TYPE_DEFINITIONS,
  OBJECT_TYPE_DEFINITIONS,
  type EaRelationshipTypeDefinition,
} from '@/pages/dependency-view/utils/eaMetaModel';

import type {
  ConnectionResolution,
  DirectRelationship,
  IndirectPath,
  IndirectHop,
  ConnectionResolutionKind,
} from './types';

// ─── Canonical EA Path Patterns ──────────────────────────────────────
// These are the canonical ArchiMate / EA best-practice patterns.
// Higher score → more preferred when ranking results.
const CANONICAL_PATTERNS: ReadonlyArray<{
  from: ObjectType;
  to: ObjectType;
  via: RelationshipType;
  score: number;
}> = [
  // Strategy → Business
  { from: 'Capability', to: 'BusinessProcess', via: 'REALIZED_BY', score: 100 },
  { from: 'Capability', to: 'Application', via: 'SUPPORTED_BY', score: 95 },
  { from: 'SubCapability', to: 'Application', via: 'SUPPORTED_BY', score: 94 },
  { from: 'BusinessService', to: 'ApplicationService', via: 'SUPPORTED_BY', score: 93 },
  // Business → Application
  { from: 'BusinessProcess', to: 'Application', via: 'SERVED_BY', score: 90 },
  { from: 'Application', to: 'ApplicationService', via: 'EXPOSES', score: 85 },
  { from: 'ApplicationService', to: 'Application', via: 'PROVIDED_BY', score: 84 },
  // Application → Technology
  { from: 'Application', to: 'Technology', via: 'DEPLOYED_ON', score: 80 },
  { from: 'Application', to: 'Server', via: 'DEPLOYED_ON', score: 80 },
  { from: 'Application', to: 'Container', via: 'DEPLOYED_ON', score: 80 },
  { from: 'Application', to: 'CloudService', via: 'DEPLOYED_ON', score: 80 },
  // Composition
  { from: 'CapabilityCategory', to: 'Capability', via: 'COMPOSED_OF', score: 75 },
  { from: 'Capability', to: 'SubCapability', via: 'COMPOSED_OF', score: 75 },
  // Ownership
  { from: 'Enterprise', to: 'Department', via: 'HAS', score: 70 },
  { from: 'Enterprise', to: 'Application', via: 'OWNS', score: 70 },
  { from: 'Enterprise', to: 'Capability', via: 'OWNS', score: 70 },
  // Implementation
  { from: 'Programme', to: 'Capability', via: 'DELIVERS', score: 65 },
  { from: 'Programme', to: 'Application', via: 'DELIVERS', score: 65 },
  { from: 'Project', to: 'Application', via: 'IMPLEMENTS', score: 65 },
];

const canonicalLookup = new Map<string, number>();
for (const p of CANONICAL_PATTERNS) {
  canonicalLookup.set(`${p.from}|${p.to}|${p.via}`, p.score);
}

function getCanonicalScore(from: ObjectType, to: ObjectType, via: RelationshipType): number {
  return canonicalLookup.get(`${from}|${to}|${via}`) ?? 0;
}

// ─── Friendly Labels ────────────────────────────────────────────────
function formatRelationshipLabel(type: RelationshipType): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPathLabel(sourceType: ObjectType, _targetType: ObjectType, hops: IndirectHop[]): string {
  const parts: string[] = [sourceType];
  for (const hop of hops) {
    parts.push(`→ [${formatRelationshipLabel(hop.relationshipType)}] → ${hop.toType}`);
  }
  return parts.join(' ');
}

// ─── Direct Relationship Resolution ─────────────────────────────────
function isEndpointMatch(
  def: EaRelationshipTypeDefinition,
  sourceType: ObjectType,
  targetType: ObjectType,
): boolean {
  const pairs = def.allowedEndpointPairs;
  if (pairs && pairs.length > 0) {
    return pairs.some((p) => p.from === sourceType && p.to === targetType);
  }
  return (
    (def.fromTypes as readonly string[]).includes(sourceType) &&
    (def.toTypes as readonly string[]).includes(targetType)
  );
}

export function findDirectRelationships(
  sourceType: ObjectType,
  targetType: ObjectType,
): DirectRelationship[] {
  const results: DirectRelationship[] = [];

  for (const [key, def] of Object.entries(RELATIONSHIP_TYPE_DEFINITIONS)) {
    const relType = key as RelationshipType;
    if (isEndpointMatch(def, sourceType, targetType)) {
      results.push({
        kind: 'direct',
        type: relType,
        fromType: sourceType,
        toType: targetType,
        label: formatRelationshipLabel(relType),
        canonicalScore: getCanonicalScore(sourceType, targetType, relType),
      });
    }
  }

  // Sort by canonical score descending.
  results.sort((a, b) => b.canonicalScore - a.canonicalScore);
  return results;
}

// ─── Indirect Path Resolution (max depth 2) ─────────────────────────
// Canonical indirect bridge patterns — well-known EA paths through intermediates.
const CANONICAL_BRIDGES: ReadonlyArray<{
  from: ObjectType;
  via: ObjectType;
  to: ObjectType;
  score: number;
}> = [
  // Capability → Application through BusinessProcess
  { from: 'Capability', via: 'BusinessProcess', to: 'Application', score: 90 },
  // Capability → Technology through Application
  { from: 'Capability', via: 'Application', to: 'Technology', score: 85 },
  { from: 'Capability', via: 'Application', to: 'Server', score: 85 },
  { from: 'Capability', via: 'Application', to: 'Container', score: 85 },
  { from: 'Capability', via: 'Application', to: 'CloudService', score: 85 },
  // BusinessProcess → Technology through Application
  { from: 'BusinessProcess', via: 'Application', to: 'Technology', score: 80 },
  { from: 'BusinessProcess', via: 'Application', to: 'Server', score: 80 },
  // BusinessService → Application through ApplicationService
  { from: 'BusinessService', via: 'ApplicationService', to: 'Application', score: 88 },
  // Enterprise → Application through Capability
  { from: 'Enterprise', via: 'Capability', to: 'Application', score: 75 },
  // Programme → Technology through Application
  { from: 'Programme', via: 'Application', to: 'Technology', score: 70 },
];

const bridgeLookup = new Map<string, number>();
for (const b of CANONICAL_BRIDGES) {
  bridgeLookup.set(`${b.from}|${b.via}|${b.to}`, b.score);
}

/**
 * Find all indirect 2-hop paths from sourceType to targetType.
 * Each path goes: source → [rel1] → intermediate → [rel2] → target.
 * Only intermediate types that can act as bridges are considered.
 */
export function findIndirectPaths(
  sourceType: ObjectType,
  targetType: ObjectType,
): IndirectPath[] {
  const results: IndirectPath[] = [];
  const seen = new Set<string>(); // dedup by intermediateType+rel1+rel2

  // Collect all element types that could serve as intermediates.
  const allTypes = Object.keys(OBJECT_TYPE_DEFINITIONS) as ObjectType[];

  for (const intermediateType of allTypes) {
    if (intermediateType === sourceType && intermediateType === targetType) continue;

    // Find relationships: source → intermediate
    for (const [key1, def1] of Object.entries(RELATIONSHIP_TYPE_DEFINITIONS)) {
      const rel1 = key1 as RelationshipType;
      if (!isEndpointMatch(def1, sourceType, intermediateType)) continue;

      // Find relationships: intermediate → target
      for (const [key2, def2] of Object.entries(RELATIONSHIP_TYPE_DEFINITIONS)) {
        const rel2 = key2 as RelationshipType;
        if (!isEndpointMatch(def2, intermediateType, targetType)) continue;

        const dedup = `${intermediateType}|${rel1}|${rel2}`;
        if (seen.has(dedup)) continue;
        seen.add(dedup);

        const hops: IndirectHop[] = [
          {
            relationshipType: rel1,
            fromType: sourceType,
            toType: intermediateType,
            intermediateElementType: intermediateType,
          },
          {
            relationshipType: rel2,
            fromType: intermediateType,
            toType: targetType,
          },
        ];

        const bridgeScore = bridgeLookup.get(`${sourceType}|${intermediateType}|${targetType}`) ?? 0;
        const hop1Score = getCanonicalScore(sourceType, intermediateType, rel1);
        const hop2Score = getCanonicalScore(intermediateType, targetType, rel2);
        const totalScore = bridgeScore + hop1Score + hop2Score;

        results.push({
          kind: 'indirect',
          hops,
          label: formatPathLabel(sourceType, targetType, hops),
          intermediateTypes: [intermediateType],
          depth: 2,
          canonicalScore: totalScore,
        });
      }
    }
  }

  // Sort by canonical score descending (prefer well-known EA paths).
  results.sort((a, b) => b.canonicalScore - a.canonicalScore);

  // Limit to top 8 paths to keep the chooser manageable.
  return results.slice(0, 8);
}

// ─── No-Path Suggestions ─────────────────────────────────────────────
function buildNoPathSuggestion(sourceType: ObjectType, targetType: ObjectType): string {
  const sLayer = OBJECT_TYPE_DEFINITIONS[sourceType].layer;
  const tLayer = OBJECT_TYPE_DEFINITIONS[targetType].layer;

  if (sLayer === tLayer) {
    return `${sourceType} and ${targetType} are both in the ${sLayer} layer but have no standard relationship. Consider adding an intermediate element or using a free connector.`;
  }

  // Suggest canonical bridging patterns.
  const suggestions: string[] = [];
  if (sLayer === 'Business' && tLayer === 'Technology') {
    suggestions.push('Add an Application element to bridge Business and Technology layers.');
  }
  if (sLayer === 'Technology' && tLayer === 'Business') {
    suggestions.push('Add an Application element to bridge Technology and Business layers.');
  }
  if (sLayer === 'Governance') {
    suggestions.push(`Governance elements (${sourceType}) typically constrain rather than connect directly. Consider using a Programme or Project to trace delivery.`);
  }

  return suggestions.length > 0
    ? suggestions.join(' ')
    : `No standard EA path exists between ${sourceType} (${sLayer}) and ${targetType} (${tLayer}). You can use a free connector for visual-only links.`;
}

// ─── Main Resolution Entry Point ─────────────────────────────────────
/**
 * Resolve all possible connections between two EA elements.
 *
 * Pipeline:
 *   1) Find direct relationships
 *   2) Find indirect paths (max depth 2)
 *   3) Rank by canonical EA preference
 *   4) Determine recommendation (auto-create / choose / no-path)
 */
export function resolveConnection(
  sourceId: string,
  targetId: string,
  sourceType: ObjectType,
  targetType: ObjectType,
  /** Optional: filter to a specific viewpoint's allowed relationship types. */
  viewpointFilter?: ReadonlySet<RelationshipType>,
): ConnectionResolution {
  // Step 1: Direct relationships.
  let directRelationships = findDirectRelationships(sourceType, targetType);
  if (viewpointFilter) {
    directRelationships = directRelationships.filter((d) => viewpointFilter.has(d.type));
  }

  // Step 2: Indirect paths.
  let indirectPaths = findIndirectPaths(sourceType, targetType);
  if (viewpointFilter) {
    indirectPaths = indirectPaths.filter((p) =>
      p.hops.every((hop) => viewpointFilter.has(hop.relationshipType)),
    );
  }

  const hasAnyPath = directRelationships.length > 0 || indirectPaths.length > 0;

  // Step 3: Determine recommendation.
  let recommendation: ConnectionResolutionKind;
  let autoCreateChoice: DirectRelationship | IndirectPath | undefined;

  if (directRelationships.length === 1 && indirectPaths.length === 0) {
    // Exactly one direct option — auto-create.
    recommendation = 'auto-create';
    autoCreateChoice = directRelationships[0];
  } else if (directRelationships.length > 1) {
    // Multiple direct options — let user choose from directs.
    recommendation = 'choose-direct';
  } else if (directRelationships.length === 0 && indirectPaths.length === 1) {
    // Only one indirect option — auto-create with intermediate.
    recommendation = 'auto-create';
    autoCreateChoice = indirectPaths[0];
  } else if (directRelationships.length === 0 && indirectPaths.length > 1) {
    // Multiple indirect options — let user choose.
    recommendation = 'choose-any';
  } else if (directRelationships.length === 1 && indirectPaths.length > 0) {
    // One direct + some indirect — auto-create with the direct (canonical preference).
    recommendation = 'auto-create';
    autoCreateChoice = directRelationships[0];
  } else if (!hasAnyPath) {
    recommendation = 'no-path';
  } else {
    // Mixed — both direct and indirect exist.
    recommendation = 'choose-any';
  }

  const noPathSuggestion = !hasAnyPath
    ? buildNoPathSuggestion(sourceType, targetType)
    : undefined;

  return {
    sourceId,
    targetId,
    sourceType,
    targetType,
    directRelationships,
    indirectPaths,
    recommendation,
    autoCreateChoice,
    hasAnyPath,
    noPathSuggestion,
  };
}

// ─── Batch Resolution (for canvas-wide target highlighting) ──────────
/**
 * For a given source, resolve connection possibilities against ALL target nodes.
 * Returns a map of targetId → ConnectionResolution.
 * Used during drag to pre-compute visual feedback for every node on canvas.
 */
export function resolveConnectionsForSource(
  sourceId: string,
  sourceType: ObjectType,
  targets: ReadonlyArray<{ id: string; type: ObjectType }>,
  viewpointFilter?: ReadonlySet<RelationshipType>,
): Map<string, ConnectionResolution> {
  const map = new Map<string, ConnectionResolution>();
  for (const target of targets) {
    if (target.id === sourceId) continue;
    const resolution = resolveConnection(sourceId, target.id, sourceType, target.type, viewpointFilter);
    map.set(target.id, resolution);
  }
  return map;
}
