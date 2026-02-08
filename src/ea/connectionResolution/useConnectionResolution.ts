/**
 * useConnectionResolution Hook
 *
 * React hook that integrates the connection resolution engine with the
 * Cytoscape canvas. Provides the full user-first connection resolution
 * pipeline for StudioShell:
 *
 *   1) Universal drag — any element on any element, never show errors
 *   2) Resolution — direct, indirect, auto-create, chooser
 *   3) Visual feedback — green/blue/neutral outlines on targets
 *   4) Post-creation editing — change type, expand/collapse intermediates
 *
 * This hook manages:
 *   - Per-target resolution cache during drag
 *   - CSS class application for visual feedback
 *   - Palette/editor state
 *   - Indirect connection creation (intermediate element insertion)
 */

import React from 'react';
import type { ObjectType, RelationshipType } from '@/pages/dependency-view/utils/eaMetaModel';
import {
  resolveConnection,
  resolveConnectionsForSource,
  findDirectRelationships,
  findIndirectPaths,
} from './connectionResolutionEngine';
import {
  getConnectionFeedback,
  clearConnectionFeedbackClasses,
  CONNECTION_FEEDBACK_CLASSES,
} from './connectionVisualFeedback';
import type {
  ConnectionResolution,
  CreatedConnection,
  ConnectionEditAction,
  IndirectPath,
} from './types';
import type { ConnectionPaletteSelection } from './InlineConnectionPalette';

// ─── Types ───────────────────────────────────────────────────────────
export type ConnectionResolutionState = {
  /** True when a drag-to-connect gesture is active. */
  isDragging: boolean;
  /** Source element for the current gesture. */
  sourceId: string | null;
  sourceType: ObjectType | null;
  /** Cached resolutions for all targets (computed on drag start). */
  resolutionCache: Map<string, ConnectionResolution>;
  /** Current hover target resolution. */
  hoverResolution: ConnectionResolution | null;
  /** Palette state (shown when multiple options). */
  paletteState: {
    resolution: ConnectionResolution;
    position: { x: number; y: number };
  } | null;
  /** Editor state (shown when clicking an existing connection). */
  editorState: {
    connection: CreatedConnection;
    validTypes: RelationshipType[];
    validIndirectPaths: IndirectPath[];
    position: { x: number; y: number };
  } | null;
  /** Registry of created indirect connections (for expand/collapse). */
  createdConnections: Map<string, CreatedConnection>;
};

export type UseConnectionResolutionOptions = {
  /** Cytoscape instance ref. */
  cyRef: React.RefObject<{ current: unknown } | null>;
  /** Function to resolve element type from ID. */
  resolveElementType: (id: string) => ObjectType | null;
  /** Current viewpoint's allowed relationship types (optional filter). */
  viewpointRelationshipTypes?: ReadonlySet<RelationshipType>;
  /** Called to create a direct relationship. */
  createRelationship: (input: {
    fromId: string;
    toId: string;
    type: RelationshipType;
  }) => { ok: boolean; id?: string; error?: string };
  /** Called to create an element (for indirect path intermediates). */
  createElement: (input: {
    type: ObjectType;
    name: string;
    derived: boolean;
    position: { x: number; y: number };
  }) => { ok: boolean; id?: string; error?: string };
  /** Callback to log to EA console. */
  logMessage?: (level: 'info' | 'warn' | 'error', message: string) => void;
};

type CyNodeCollection = {
  forEach: (fn: (node: CyNode) => void) => void;
};

type CyNode = {
  id: () => string;
  data: (key?: string) => unknown;
  position: (axis?: string) => { x: number; y: number } | number;
  addClass: (cls: string) => void;
  removeClass: (cls: string) => void;
  empty: () => boolean;
  renderedPosition: () => { x: number; y: number };
};

// ─── Initial State ──────────────────────────────────────────────────
const INITIAL_STATE: ConnectionResolutionState = {
  isDragging: false,
  sourceId: null,
  sourceType: null,
  resolutionCache: new Map(),
  hoverResolution: null,
  paletteState: null,
  editorState: null,
  createdConnections: new Map(),
};

// ─── Hook ────────────────────────────────────────────────────────────
export function useConnectionResolution(options: UseConnectionResolutionOptions) {
  const {
    resolveElementType,
    viewpointRelationshipTypes,
    createRelationship,
    createElement,
    logMessage,
  } = options;

  const [state, setState] = React.useState<ConnectionResolutionState>(INITIAL_STATE);
  const stateRef = React.useRef(state);
  stateRef.current = state;

  // ─── Drag Start ──────────────────────────────────────────────────
  /**
   * Called when a drag-to-connect gesture begins.
   * Pre-computes resolution for ALL targets on the canvas.
   */
  const onDragStart = React.useCallback(
    (sourceId: string, allTargets: ReadonlyArray<{ id: string; type: ObjectType }>) => {
      const sourceType = resolveElementType(sourceId);
      if (!sourceType) return;

      const cache = resolveConnectionsForSource(
        sourceId,
        sourceType,
        allTargets,
        viewpointRelationshipTypes,
      );

      setState((prev) => ({
        ...prev,
        isDragging: true,
        sourceId,
        sourceType,
        resolutionCache: cache,
        hoverResolution: null,
        paletteState: null,
      }));
    },
    [resolveElementType, viewpointRelationshipTypes],
  );

  // ─── Hover Target ────────────────────────────────────────────────
  /**
   * Called when the cursor hovers over a target node during drag.
   * Applies visual feedback CSS class. NEVER shows errors.
   */
  const onHoverTarget = React.useCallback(
    (targetId: string, targetNode: CyNode) => {
      const resolution = stateRef.current.resolutionCache.get(targetId) ?? null;
      setState((prev) => ({ ...prev, hoverResolution: resolution }));

      if (!resolution) {
        // No resolution available — neutral feedback (NOT an error).
        clearConnectionFeedbackClasses(targetNode);
        return;
      }

      const feedback = getConnectionFeedback(resolution);
      clearConnectionFeedbackClasses(targetNode);
      if (feedback.cssClass && feedback.cssClass !== CONNECTION_FEEDBACK_CLASSES.neutral) {
        targetNode.addClass(feedback.cssClass);
      }
    },
    [],
  );

  // ─── Leave Target ────────────────────────────────────────────────
  const onLeaveTarget = React.useCallback((targetNode: CyNode) => {
    clearConnectionFeedbackClasses(targetNode);
    setState((prev) => ({ ...prev, hoverResolution: null }));
  }, []);

  // ─── Drag End / Drop ─────────────────────────────────────────────
  /**
   * Called when a drag-to-connect gesture ends on a target.
   * Implements the full resolution pipeline:
   *   - auto-create if unambiguous
   *   - show palette if multiple options
   *   - show suggestion if no path
   */
  const onDrop = React.useCallback(
    (targetId: string, screenPosition: { x: number; y: number }) => {
      const { sourceId, sourceType, resolutionCache } = stateRef.current;
      if (!sourceId || !sourceType) return;

      const targetType = resolveElementType(targetId);
      if (!targetType) return;

      let resolution = resolutionCache.get(targetId);
      if (!resolution) {
        // Compute on demand if not cached.
        resolution = resolveConnection(
          sourceId,
          targetId,
          sourceType,
          targetType,
          viewpointRelationshipTypes,
        );
      }

      // Clear drag state.
      setState((prev) => ({
        ...prev,
        isDragging: false,
        hoverResolution: null,
        resolutionCache: new Map(),
      }));

      switch (resolution.recommendation) {
        case 'auto-create': {
          const choice = resolution.autoCreateChoice;
          if (!choice) break;

          if (choice.kind === 'direct') {
            const result = createRelationship({
              fromId: sourceId,
              toId: targetId,
              type: choice.type,
            });
            if (result.ok) {
              logMessage?.('info', `Connected: ${sourceType} → ${targetType} (${choice.label})`);
              if (result.id) {
                setState((prev) => {
                  const next = new Map(prev.createdConnections);
                  const rid = result.id as string;
                  next.set(rid, {
                    primaryEdgeId: rid,
                    primaryType: choice.type,
                    sourceId,
                    targetId,
                    isDerived: false,
                    intermediateElementIds: [],
                    intermediateEdgeIds: [],
                    collapsed: false,
                  });
                  return { ...prev, createdConnections: next };
                });
              }
            } else {
              logMessage?.('warn', result.error ?? 'Failed to create connection.');
            }
          } else {
            // Indirect — auto-create with intermediate elements.
            executeIndirectPath(sourceId, targetId, choice, screenPosition);
          }
          break;
        }

        case 'choose-direct':
        case 'choose-any':
          // Show the inline palette.
          setState((prev) => ({
            ...prev,
            paletteState: {
              resolution,
              position: screenPosition,
            },
          }));
          break;

        case 'no-path':
          if (resolution.noPathSuggestion) {
            logMessage?.('info', resolution.noPathSuggestion);
          }
          break;
      }
    },
    [createRelationship, logMessage, resolveElementType, viewpointRelationshipTypes],
  );

  // ─── Execute Indirect Path ───────────────────────────────────────
  /**
   * Creates intermediate elements and all relationships for an indirect path.
   * Intermediate elements are marked as derived=true.
   */
  const executeIndirectPath = React.useCallback(
    (
      sourceId: string,
      targetId: string,
      path: IndirectPath,
      screenPosition: { x: number; y: number },
    ) => {
      const intermediateIds: string[] = [];
      const edgeIds: string[] = [];

      // Create intermediate elements.
      for (const intermediateType of path.intermediateTypes) {
        const result = createElement({
          type: intermediateType,
          name: `${intermediateType} (auto)`,
          derived: true,
          position: screenPosition, // Will be laid out by the caller.
        });
        if (!result.ok || !result.id) {
          logMessage?.('warn', `Failed to create intermediate ${intermediateType}: ${result.error}`);
          return;
        }
        intermediateIds.push(result.id);
      }

      // Create relationships along the path.
      const nodeChain = [sourceId, ...intermediateIds, targetId];
      for (let i = 0; i < path.hops.length; i++) {
        const hop = path.hops[i];
        const from = nodeChain[i];
        const to = nodeChain[i + 1];
        const result = createRelationship({
          fromId: from,
          toId: to,
          type: hop.relationshipType,
        });
        if (!result.ok) {
          logMessage?.('warn', `Failed to create hop ${hop.fromType} → ${hop.toType}: ${result.error}`);
          return;
        }
        if (result.id) edgeIds.push(result.id);
      }

      // Register the compound connection.
      const primaryEdgeId = edgeIds[edgeIds.length - 1] ?? `compound-${Date.now()}`;
      setState((prev) => {
        const next = new Map(prev.createdConnections);
        next.set(primaryEdgeId, {
          primaryEdgeId,
          primaryType: path.hops[path.hops.length - 1].relationshipType,
          sourceId,
          targetId,
          isDerived: true,
          intermediateElementIds: intermediateIds,
          intermediateEdgeIds: edgeIds,
          collapsed: true, // Start collapsed — single visual edge.
        });
        return { ...prev, createdConnections: next };
      });

      logMessage?.(
        'info',
        `Connected indirectly: ${path.label} (${intermediateIds.length} intermediate${intermediateIds.length === 1 ? '' : 's'} created)`,
      );
    },
    [createElement, createRelationship, logMessage],
  );

  // ─── Palette Selection ───────────────────────────────────────────
  const onPaletteSelect = React.useCallback(
    (selection: ConnectionPaletteSelection) => {
      const paletteState = stateRef.current.paletteState;
      if (!paletteState) return;

      const { resolution } = paletteState;
      setState((prev) => ({ ...prev, paletteState: null }));

      if (selection.kind === 'direct') {
        const result = createRelationship({
          fromId: resolution.sourceId,
          toId: resolution.targetId,
          type: selection.type,
        });
        if (result.ok) {
          logMessage?.('info', `Connected: ${resolution.sourceType} → ${resolution.targetType}`);
          if (result.id) {
            setState((prev) => {
              const next = new Map(prev.createdConnections);
              const rid = result.id as string;
              next.set(rid, {
                primaryEdgeId: rid,
                primaryType: selection.type,
                sourceId: resolution.sourceId,
                targetId: resolution.targetId,
                isDerived: false,
                intermediateElementIds: [],
                intermediateEdgeIds: [],
                collapsed: false,
              });
              return { ...prev, createdConnections: next };
            });
          }
        } else {
          logMessage?.('warn', result.error ?? 'Failed to create connection.');
        }
      } else {
        executeIndirectPath(
          resolution.sourceId,
          resolution.targetId,
          selection.path,
          paletteState.position,
        );
      }
    },
    [createRelationship, executeIndirectPath, logMessage],
  );

  // ─── Palette Dismiss ─────────────────────────────────────────────
  const onPaletteDismiss = React.useCallback(() => {
    setState((prev) => ({ ...prev, paletteState: null }));
  }, []);

  // ─── Post-Creation Edit Actions ──────────────────────────────────
  const onEditorAction = React.useCallback(
    (action: ConnectionEditAction) => {
      const editorState = stateRef.current.editorState;
      if (!editorState) return;

      const { connection } = editorState;

      switch (action.action) {
        case 'change-type':
          // TODO: Implement type change via repository transaction.
          logMessage?.('info', `Relationship type changed to ${action.newType}`);
          setState((prev) => {
            const next = new Map(prev.createdConnections);
            const updated = { ...connection, primaryType: action.newType };
            next.set(connection.primaryEdgeId, updated);
            return { ...prev, createdConnections: next, editorState: { ...editorState, connection: updated } };
          });
          break;

        case 'expand-intermediates':
          logMessage?.('info', 'Expanded intermediate elements.');
          setState((prev) => {
            const next = new Map(prev.createdConnections);
            const updated = { ...connection, collapsed: false };
            next.set(connection.primaryEdgeId, updated);
            return { ...prev, createdConnections: next, editorState: { ...editorState, connection: updated } };
          });
          break;

        case 'collapse-intermediates':
          logMessage?.('info', 'Collapsed to single edge.');
          setState((prev) => {
            const next = new Map(prev.createdConnections);
            const updated = { ...connection, collapsed: true };
            next.set(connection.primaryEdgeId, updated);
            return { ...prev, createdConnections: next, editorState: { ...editorState, connection: updated } };
          });
          break;

        case 'switch-path':
          logMessage?.('info', `Switched path to: via ${action.newPath.intermediateTypes.join(' → ')}`);
          // TODO: Remove old intermediates, create new path.
          break;
      }
    },
    [logMessage],
  );

  const onEditorDismiss = React.useCallback(() => {
    setState((prev) => ({ ...prev, editorState: null }));
  }, []);

  // ─── Open Editor for Existing Connection ─────────────────────────
  const openEditorForEdge = React.useCallback(
    (edgeId: string, position: { x: number; y: number }) => {
      const connection = stateRef.current.createdConnections.get(edgeId);
      if (!connection) return;

      const sourceType = resolveElementType(connection.sourceId);
      const targetType = resolveElementType(connection.targetId);
      if (!sourceType || !targetType) return;

      const validTypes = findDirectRelationships(sourceType, targetType).map((d) => d.type);
      const validIndirectPaths = findIndirectPaths(sourceType, targetType);

      setState((prev) => ({
        ...prev,
        editorState: {
          connection,
          validTypes,
          validIndirectPaths,
          position,
        },
      }));
    },
    [resolveElementType],
  );

  // ─── Cancel Drag ─────────────────────────────────────────────────
  const cancelDrag = React.useCallback(() => {
    setState((prev) => ({
      ...prev,
      isDragging: false,
      sourceId: null,
      sourceType: null,
      resolutionCache: new Map(),
      hoverResolution: null,
    }));
  }, []);

  // ─── Get Feedback for Target ─────────────────────────────────────
  const getFeedbackForTarget = React.useCallback(
    (targetId: string) => {
      const resolution = stateRef.current.resolutionCache.get(targetId);
      if (!resolution) return null;
      return getConnectionFeedback(resolution);
    },
    [],
  );

  return {
    state,
    onDragStart,
    onHoverTarget,
    onLeaveTarget,
    onDrop,
    onPaletteSelect,
    onPaletteDismiss,
    onEditorAction,
    onEditorDismiss,
    openEditorForEdge,
    cancelDrag,
    getFeedbackForTarget,
  };
}
