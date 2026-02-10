type RepositoryEventPayload = {
  workspaceId?: string;
};

type ElementEventPayload = RepositoryEventPayload & {
  elementId: string;
  elementType?: string;
};

type RelationshipEventPayload = RepositoryEventPayload & {
  relationshipId: string;
  relationshipType?: string;
  sourceId?: string;
  targetId?: string;
};

const dispatch = <T>(name: string, payload?: T) => {
  if (typeof window === 'undefined') return;
  if (payload) {
    window.dispatchEvent(new CustomEvent(name, { detail: payload }));
    return;
  }
  window.dispatchEvent(new Event(name));
};

export const emitRepositoryChanged = (payload?: RepositoryEventPayload) =>
  dispatch('ea:repositoryChanged', payload);

export const emitRelationshipsChanged = (payload?: RepositoryEventPayload) =>
  dispatch('ea:relationshipsChanged', payload);

export const emitElementCreated = (payload: ElementEventPayload) =>
  dispatch('ea:elementCreated', payload);

export const emitElementUpdated = (payload: ElementEventPayload) =>
  dispatch('ea:elementUpdated', payload);

export const emitElementDeleted = (payload: ElementEventPayload) =>
  dispatch('ea:elementDeleted', payload);

export const emitRelationshipCreated = (payload: RelationshipEventPayload) =>
  dispatch('ea:relationshipCreated', payload);

export const emitRelationshipUpdated = (payload: RelationshipEventPayload) =>
  dispatch('ea:relationshipUpdated', payload);

export const emitRelationshipDeleted = (payload: RelationshipEventPayload) =>
  dispatch('ea:relationshipDeleted', payload);
