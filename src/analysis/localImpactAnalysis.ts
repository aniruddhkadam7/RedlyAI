import type { ImpactAnalysisRequest } from '../../backend/analysis/ImpactAnalysisRequest';
import type { ImpactRankedElement } from '../../backend/analysis/ImpactRanking';
import type { ImpactSummary } from '../../backend/analysis/ImpactSummary';
import type { ImpactSeverityScore } from '../../backend/analysis/ImpactSeverityScore';
import type { ImpactedElementEvidence } from '../../backend/analysis/ImpactedElementDeriver';
import type { EaRepository, EaObject } from '@/pages/dependency-view/utils/eaRepository';
import { RELATIONSHIP_TYPE_DEFINITIONS, type ObjectType, type RelationshipType } from '@/pages/dependency-view/utils/eaMetaModel';

const normalizeId = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const severityForScore = (computedScore: number): ImpactSeverityScore['severityLabel'] => {
  if (computedScore >= 50) return 'High';
  if (computedScore >= 20) return 'Medium';
  return 'Low';
};

export type LocalImpactAnalyzeResult = {
  impactSummary: ImpactSummary;
  rankedImpacts: ImpactRankedElement[];
};

/**
 * Local, diagram-independent fallback impact analysis.
 *
 * This is intentionally conservative and bounded:
 * - Enumerates reachable nodes up to maxDepth (BFS)
 * - Uses a cheap path-count proxy (edge expansions) capped per element
 * - Produces a best-effort ranking compatible with AnalysisResultTab
 */
export function analyzeImpactLocally(args: {
  repository: EaRepository;
  request: ImpactAnalysisRequest;
}): LocalImpactAnalyzeResult {
  const repo = args.repository;
  const request = args.request;

  const rootId = normalizeId(request.rootElementId);
  const maxDepth = typeof request.maxDepth === 'number' && request.maxDepth > 0 ? Math.trunc(request.maxDepth) : 5;

  const allowedRelationshipTypes = new Set(
    (request.includedRelationshipTypes ?? []).map((t) => normalizeId(t)).filter((t) => t.length > 0),
  );

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  const relationshipAllowedByMetamodel = (
    relType: RelationshipType,
    from: EaObject | undefined,
    to: EaObject | undefined,
  ) => {
    if (!from || !to) return false;
    const def = RELATIONSHIP_TYPE_DEFINITIONS[relType];
    if (!def) return false;

    const fromType: ObjectType = from.type;
    const toType: ObjectType = to.type;

    if (Array.isArray(def.allowedEndpointPairs) && def.allowedEndpointPairs.length > 0) {
      return def.allowedEndpointPairs.some((p) => p.from === fromType && p.to === toType);
    }

    return def.fromTypes.includes(fromType) && def.toTypes.includes(toType);
  };

  for (const r of repo.relationships ?? []) {
    const type = normalizeId((r as any)?.type);
    if (!type) continue;
    if (allowedRelationshipTypes.size > 0 && !allowedRelationshipTypes.has(type)) continue;

    const fromId = normalizeId((r as any)?.fromId);
    const toId = normalizeId((r as any)?.toId);
    if (!fromId || !toId) continue;

    const fromObj = repo.objects.get(fromId);
    const toObj = repo.objects.get(toId);
    if (!relationshipAllowedByMetamodel(type as RelationshipType, fromObj, toObj)) continue;

    if (!outgoing.has(fromId)) outgoing.set(fromId, []);
    outgoing.get(fromId)!.push(toId);

    if (!incoming.has(toId)) incoming.set(toId, []);
    incoming.get(toId)!.push(fromId);
  }

  type QueueItem = { nodeId: string; depth: number };

  const visitedAtDepth = new Set<string>();
  const visitedAnyDepth = new Set<string>();
  const maxDepthObserved = new Map<string, number>();
  const pathCountProxy = new Map<string, number>();

  const pushVisit = (nodeId: string, depth: number) => {
    const key = `${nodeId}|${depth}`;
    if (visitedAtDepth.has(key)) return false;
    visitedAtDepth.add(key);
    visitedAnyDepth.add(nodeId);
    return true;
  };

  const queue: QueueItem[] = [];
  if (rootId) {
    queue.push({ nodeId: rootId, depth: 0 });
    pushVisit(rootId, 0);
  }

  const neighborsFor = (nodeId: string): readonly string[] => {
    if (request.direction === 'Upstream') return incoming.get(nodeId) ?? [];
    if (request.direction === 'Downstream') return outgoing.get(nodeId) ?? [];
    // Bidirectional: union
    const o = outgoing.get(nodeId) ?? [];
    const i = incoming.get(nodeId) ?? [];
    if (o.length === 0) return i;
    if (i.length === 0) return o;
    return [...o, ...i];
  };

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.depth >= maxDepth) continue;

    const nextDepth = cur.depth + 1;
    const neighbors = neighborsFor(cur.nodeId);
    for (const rawNext of neighbors) {
      const nextId = normalizeId(rawNext);
      if (!nextId) continue;

      // Cycle guard: stop expansion if this node was already reached at any depth.
      if (visitedAnyDepth.has(nextId)) {
        continue;
      }

      // Update max depth.
      const prevMax = maxDepthObserved.get(nextId) ?? 0;
      if (nextDepth > prevMax) maxDepthObserved.set(nextId, nextDepth);

      // Path proxy: count edge expansions reaching this node (bounded).
      const prevCount = pathCountProxy.get(nextId) ?? 0;
      if (prevCount < 10_000) pathCountProxy.set(nextId, prevCount + 1);

      if (nextDepth <= maxDepth && pushVisit(nextId, nextDepth)) {
        queue.push({ nodeId: nextId, depth: nextDepth });
      }
    }
  }

  // Build evidence + score for all reached nodes (excluding root).
  const evidence: ImpactedElementEvidence[] = [];
  const scores: ImpactSeverityScore[] = [];

  for (const [elementId, depthObserved] of maxDepthObserved.entries()) {
    if (!elementId || elementId === rootId) continue;

    const totalPaths = pathCountProxy.get(elementId) ?? 0;

    const e: ImpactedElementEvidence = {
      elementId,
      totalPathsAffectingElement: totalPaths,
      hardPathCount: 0,
      softOnlyPathCount: 0,
      maxDepthObserved: depthObserved,
    };
    evidence.push(e);

    const computedScore = clamp(1 + totalPaths, 0, 100);
    scores.push({
      elementId,
      totalPaths,
      hardPathCount: 0,
      softOnlyPathCount: 0,
      elementCriticality: 'Unknown',
      computedScore,
      severityLabel: severityForScore(computedScore),
    });
  }

  const scoreById = new Map(scores.map((s) => [s.elementId, s] as const));

  const rankedImpacts: ImpactRankedElement[] = evidence
    .map((e, idx) => {
      const score = scoreById.get(e.elementId);
      return {
        elementId: e.elementId,
        evidence: e,
        score,
        // stable tie-break
        _idx: idx,
      } as ImpactRankedElement & { _idx: number };
    })
    .sort((a, b) => {
      const as = (a.score?.computedScore ?? 0) - (b.score?.computedScore ?? 0);
      if (as !== 0) return -as;
      if (a.evidence.maxDepthObserved !== b.evidence.maxDepthObserved) return b.evidence.maxDepthObserved - a.evidence.maxDepthObserved;
      if (a.evidence.totalPathsAffectingElement !== b.evidence.totalPathsAffectingElement) {
        return b.evidence.totalPathsAffectingElement - a.evidence.totalPathsAffectingElement;
      }
      return a._idx - b._idx;
    })
    .map(({ _idx, ...rest }) => rest);

  const severityBreakdown: ImpactSummary['severityBreakdown'] = { High: 0, Medium: 0, Low: 0 };
  for (const r of rankedImpacts) {
    const label = r.score?.severityLabel ?? 'Low';
    severityBreakdown[label] += 1;
  }

  const impactSummary: ImpactSummary = {
    rootElementId: rootId,
    totalImpactedElements: rankedImpacts.length,
    severityBreakdown,
    maxDependencyDepthObserved: Math.max(0, ...evidence.map((e) => e.maxDepthObserved)),
    analysisTimestamp: new Date().toISOString(),
  };

  return { impactSummary, rankedImpacts };
}
