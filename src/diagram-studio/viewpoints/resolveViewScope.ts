import { ViewpointRegistry } from './ViewpointRegistry';
import type { ViewInstance } from './ViewInstance';
import type { EaObject, EaPersistedRelationship, EaRepository } from '@/pages/dependency-view/utils/eaRepository';

export type ViewScopeResolutionResult = {
  readonly elements: readonly EaObject[];
  readonly relationships: readonly EaPersistedRelationship[];
};

const normalize = (value: string): string => (value ?? '').trim();

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

  const relationships = repository.relationships.filter((rel) => {
    if (!allowedRelationshipTypes.has(normalize(rel.type))) return false;
    const fromId = normalize(rel.fromId);
    const toId = normalize(rel.toId);
    return allowedIds.has(fromId) && allowedIds.has(toId);
  });

  return { elements, relationships };
}
