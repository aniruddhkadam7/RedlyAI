import { ViewpointRegistry } from './ViewpointRegistry';
import type { ViewInstance } from './ViewInstance';
import type { EaObject, EaPersistedRelationship, EaRepository } from '@/pages/dependency-view/utils/eaRepository';

export type ViewScopeResolutionResult = {
  readonly elements: readonly EaObject[];
  readonly relationships: readonly EaPersistedRelationship[];
};

const normalize = (value: string): string => (value ?? '').trim();

/**
 * Resolve the elements and relationships visible in a view.
 *
 * VIEW ISOLATION RULE: A view is an **isolated projection** of the repository.
 * Only elements and relationships explicitly listed in the view's membership
 * sets are returned. Elements and relationships NEVER leak between views.
 *
 * - `ManualSelection` scope: only elements whose IDs are in `scope.elementIds`
 *   AND that match the viewpoint's allowed element types are included.
 * - `EntireRepository` scope: elements matching the viewpoint's allowed types
 *   are included (backward-compatible, but new views should use ManualSelection).
 * - Relationships: if `view.visibleRelationshipIds` is defined, ONLY those
 *   relationships are considered. Otherwise, all repository relationships whose
 *   type is allowed AND whose endpoints are both visible are included.
 */
export function resolveViewScope(args: {
  readonly view: ViewInstance;
  readonly repository: EaRepository;
}): ViewScopeResolutionResult {
  const { view, repository } = args;

  const viewpoint = ViewpointRegistry.require(view.viewpointId);
  const allowedElementTypes = new Set(viewpoint.allowedElementTypes.map(normalize));
  const allowedRelationshipTypes = new Set(viewpoint.allowedRelationshipTypes.map(normalize));

  const scopeFilter = (() => {
    if (view.scope.kind === 'ManualSelection') {
      const ids = new Set((view.scope.elementIds ?? []).map(normalize).filter(Boolean));
      return (id: string) => ids.has(normalize(id));
    }
    return (_id: string) => true;
  })();

  const elements = Array.from(repository.objects.values()).filter((obj) => {
    return allowedElementTypes.has(normalize(obj.type)) && scopeFilter(obj.id);
  });

  const allowedIds = new Set(elements.map((e) => normalize(e.id)));

  // VIEW ISOLATION: If the view declares visibleRelationshipIds, only those
  // relationships are eligible. This prevents relationships created in other
  // views from appearing here.
  const visibleRelIds = view.visibleRelationshipIds;
  const hasExplicitRelFilter = Array.isArray(visibleRelIds) && visibleRelIds.length > 0;
  const visibleRelIdSet = hasExplicitRelFilter
    ? new Set(visibleRelIds?.map(normalize).filter(Boolean))
    : null;

  const relationships = repository.relationships.filter((rel) => {
    if (!allowedRelationshipTypes.has(normalize(rel.type))) return false;
    const fromId = normalize(rel.fromId);
    const toId = normalize(rel.toId);
    if (!allowedIds.has(fromId) || !allowedIds.has(toId)) return false;
    // If the view tracks explicit relationship IDs, enforce the filter
    if (visibleRelIdSet) {
      const relId = normalize(rel.id ?? `${rel.fromId}__${rel.toId}__${rel.type}`);
      return visibleRelIdSet.has(relId);
    }
    return true;
  });

  return { elements, relationships };
}
