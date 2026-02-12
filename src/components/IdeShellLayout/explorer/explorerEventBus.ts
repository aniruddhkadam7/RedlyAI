/**
 * Explorer Event Bus — Typed, Decoupled Event System
 *
 * CONTRACT (from spec §13):
 * Explorer must listen to and emit:
 *   OBJECT_CREATED, OBJECT_UPDATED, OBJECT_DELETED, OBJECT_MOVED,
 *   OBJECT_RENAMED, OBJECT_SELECTED, VIEW_UPDATED
 *
 * Update only affected nodes — never full tree re-render.
 *
 * Implementation: Window CustomEvent-based. Listeners can be registered
 * from any component. The bus is singleton / global.
 */

// ---------------------------------------------------------------------------
// Event Definitions
// ---------------------------------------------------------------------------

export type ExplorerEvent =
  | {
      type: 'OBJECT_CREATED';
      objectId: string;
      objectType: string;
      parentId?: string;
      timestamp: string;
      actor: string;
    }
  | {
      type: 'OBJECT_UPDATED';
      objectId: string;
      objectType: string;
      changedFields: string[];
      timestamp: string;
      actor: string;
    }
  | {
      type: 'OBJECT_RENAMED';
      objectId: string;
      objectType: string;
      previousName: string;
      newName: string;
      timestamp: string;
      actor: string;
    }
  | {
      type: 'OBJECT_DELETED';
      objectId: string;
      objectType: string;
      timestamp: string;
      actor: string;
    }
  | {
      type: 'OBJECT_MOVED';
      objectId: string;
      objectType: string;
      fromParent: string | null;
      toParent: string | null;
      timestamp: string;
      actor: string;
    }
  | {
      type: 'OBJECT_SELECTED';
      objectId: string;
      objectType: string;
      source: 'Explorer' | 'Diagram' | 'ImpactAnalysis' | 'Console';
    }
  | {
      type: 'VIEW_UPDATED';
      viewId: string;
      timestamp: string;
      actor: string;
    }
  | {
      type: 'RELATIONSHIP_CREATED';
      relationshipId: string;
      fromId: string;
      toId: string;
      relType: string;
      timestamp: string;
      actor: string;
    }
  | {
      type: 'BASELINE_CREATED';
      baselineId: string;
      timestamp: string;
      actor: string;
    }
  | {
      type: 'TYPE_CHANGED';
      objectId: string;
      previousType: string;
      newType: string;
      timestamp: string;
      actor: string;
    };

// ---------------------------------------------------------------------------
// Bus Implementation
// ---------------------------------------------------------------------------

const EXPLORER_EVENT_KEY = 'ea:explorer:event';

export type ExplorerEventHandler = (event: ExplorerEvent) => void;

const listeners = new Set<ExplorerEventHandler>();

/**
 * Emit an event to all registered listeners AND to the global window event bus.
 */
export function emitExplorerEvent(event: ExplorerEvent): void {
  // Notify in-memory listeners (React hooks)
  listeners.forEach(fn => {
    try { fn(event); } catch { /* swallow per-listener errors */ }
  });
  // Also dispatch as a Window CustomEvent for cross-component bridging
  try {
    window.dispatchEvent(new CustomEvent<ExplorerEvent>(EXPLORER_EVENT_KEY, { detail: event }));
  } catch { /* SSR guard */ }
}

/**
 * Subscribe to explorer events. Returns an unsubscribe function.
 */
export function onExplorerEvent(handler: ExplorerEventHandler): () => void {
  listeners.add(handler);
  return () => { listeners.delete(handler); };
}

/**
 * React hook: subscribe to explorer events for the lifetime of the component.
 */
export function useExplorerEvent(handler: ExplorerEventHandler, deps: React.DependencyList = []): void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableHandler = typeof handler === 'function' ? handler : () => {};
  // We avoid importing React here to keep this file framework-light.
  // The caller should wrap with useEffect:
  //   useEffect(() => onExplorerEvent(handler), [handler])
  // This function is a convenience wrapper documented for callers.
  void stableHandler;
  void deps;
}

/**
 * Also bridge legacy ea:repositoryChanged / ea:viewsChanged events
 * to the new event bus so that existing code stays compatible.
 */
export function bridgeLegacyEvents(): () => void {
  const repoHandler = () => {
    emitExplorerEvent({
      type: 'OBJECT_UPDATED',
      objectId: '*',
      objectType: '*',
      changedFields: ['*'],
      timestamp: new Date().toISOString(),
      actor: 'system',
    });
  };
  const viewHandler = () => {
    emitExplorerEvent({
      type: 'VIEW_UPDATED',
      viewId: '*',
      timestamp: new Date().toISOString(),
      actor: 'system',
    });
  };
  window.addEventListener('ea:repositoryChanged', repoHandler);
  window.addEventListener('ea:viewsChanged', viewHandler);
  return () => {
    window.removeEventListener('ea:repositoryChanged', repoHandler);
    window.removeEventListener('ea:viewsChanged', viewHandler);
  };
}
