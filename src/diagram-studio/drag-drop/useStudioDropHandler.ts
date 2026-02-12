/**
 * useStudioDropHandler — React hook for handling view drops on the Studio canvas.
 *
 * Responsibilities:
 * - Detect VIEW drag payloads in `onDragOver` and accept them.
 * - Show/hide drop highlight state.
 * - On `drop`, validate the payload and delegate to `ViewOpenService`.
 * - Surface user-facing errors via the `message` API.
 *
 * This hook does NOT touch Cytoscape or tab state directly.
 * It communicates through `ViewOpenService` → event bus → `ensureViewTab`.
 */

import { message } from 'antd';
import React from 'react';
import {
  hasRoadmapDragPayload,
  hasViewDragPayload,
  readRoadmapIdFromDrop,
  readViewIdFromDrop,
} from './DragDropConstants';
import { ViewOpenService } from './ViewOpenService';

export type StudioDropHandlerState = {
  /** True while a valid view payload is hovering over the drop zone. */
  isDropTargetActive: boolean;
};

export type StudioDropHandlerCallbacks = {
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
};

type UseStudioDropHandlerOptions = {
  /** Whether the Studio is in a state that should accept drops (e.g. not in a locked workspace). */
  enabled?: boolean;
  /** Called after a view is successfully opened from a drop. */
  onViewOpened?: (viewId: string) => void;
};

/**
 * Hook that provides drag-over / drop event handlers for the Studio canvas div.
 *
 * Usage:
 * ```tsx
 * const { state, handlers } = useStudioDropHandler({ enabled: true });
 * <div
 *   className={state.isDropTargetActive ? styles.dropHighlight : ''}
 *   {...handlers}
 * />
 * ```
 */
export const useStudioDropHandler = (
  options: UseStudioDropHandlerOptions = {},
): { state: StudioDropHandlerState; handlers: StudioDropHandlerCallbacks } => {
  const { enabled = true, onViewOpened } = options;

  // Counter tracks nested enter/leave so highlight stays while hovering children.
  const dragCounterRef = React.useRef(0);
  const [isDropTargetActive, setIsDropTargetActive] = React.useState(false);

  const onDragEnter = React.useCallback(
    (e: React.DragEvent) => {
      if (!enabled) return;
      const dt = e.nativeEvent.dataTransfer;
      if (!dt) return;
      if (!hasViewDragPayload(dt) && !hasRoadmapDragPayload(dt)) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      if (dragCounterRef.current === 1) {
        setIsDropTargetActive(true);
      }
    },
    [enabled],
  );

  const onDragLeave = React.useCallback(
    (e: React.DragEvent) => {
      if (!enabled) return;
      const dt = e.nativeEvent.dataTransfer;
      if (!dt) return;
      if (!hasViewDragPayload(dt) && !hasRoadmapDragPayload(dt)) return;
      e.preventDefault();
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) {
        setIsDropTargetActive(false);
      }
    },
    [enabled],
  );

  const onDragOver = React.useCallback(
    (e: React.DragEvent) => {
      if (!enabled) return;
      const dt = e.nativeEvent.dataTransfer;
      if (!dt) return;
      // Accept the drop only for view payloads. Let other types (element, toolbox) fall through.
      if (hasViewDragPayload(dt) || hasRoadmapDragPayload(dt)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    },
    [enabled],
  );

  const onDrop = React.useCallback(
    (e: React.DragEvent) => {
      // Reset highlight regardless.
      dragCounterRef.current = 0;
      setIsDropTargetActive(false);

      if (!enabled) return;

      const dt = e.nativeEvent.dataTransfer;
      if (!dt) return;

      const viewId = readViewIdFromDrop(dt);
      if (viewId) {
        e.preventDefault();
        e.stopPropagation();

        const result = ViewOpenService.open(viewId);
        if (result.outcome === 'error') {
          message.error(result.reason);
        } else {
          onViewOpened?.(viewId);
        }
        return;
      }

      const roadmapId = readRoadmapIdFromDrop(dt);
      if (roadmapId) {
        e.preventDefault();
        e.stopPropagation();
        // Roadmap opening could be added here in the future.
        // For now, roadmaps are informational only.
        message.info('Roadmap drop is not yet supported on the canvas.');
        return;
      }

      // Not a view/roadmap drop — let the existing element drop handler proceed.
    },
    [enabled, onViewOpened],
  );

  return {
    state: { isDropTargetActive },
    handlers: { onDragOver, onDragEnter, onDragLeave, onDrop },
  };
};
