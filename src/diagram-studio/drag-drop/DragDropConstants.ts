/**
 * Drag & Drop constants for view-level drag operations.
 *
 * These MIME types are used in HTML5 DataTransfer payloads to carry
 * lightweight identifiers between drag sources (Explorer, catalog, etc.)
 * and drop targets (Studio canvas).
 *
 * Rule: Never embed full object data in the drag payload — only IDs.
 */

/** MIME type for the drag payload carrying a view ID. */
export const DRAG_MIME_VIEW_ID = 'application/x-ea-view-id' as const;

/** MIME type for the drag payload carrying a roadmap ID. */
export const DRAG_MIME_ROADMAP_ID = 'application/x-ea-roadmap-id' as const;

/** Drag payload type discriminator — matches `type` in the payload JSON. */
export type DragPayloadType = 'VIEW' | 'ROADMAP';

/**
 * Checks if a DataTransfer contains a view drag payload.
 * Use this in `onDragOver` to decide whether to accept the drop.
 */
export const hasViewDragPayload = (dataTransfer: DataTransfer): boolean => {
  return dataTransfer.types.includes(DRAG_MIME_VIEW_ID);
};

/**
 * Reads the view ID from a DataTransfer (only available in `onDrop`).
 * Returns an empty string if not present.
 */
export const readViewIdFromDrop = (dataTransfer: DataTransfer): string => {
  return (dataTransfer.getData(DRAG_MIME_VIEW_ID) ?? '').trim();
};

/**
 * Checks if a DataTransfer contains a roadmap drag payload.
 */
export const hasRoadmapDragPayload = (dataTransfer: DataTransfer): boolean => {
  return dataTransfer.types.includes(DRAG_MIME_ROADMAP_ID);
};

/**
 * Reads the roadmap ID from a DataTransfer.
 */
export const readRoadmapIdFromDrop = (dataTransfer: DataTransfer): string => {
  return (dataTransfer.getData(DRAG_MIME_ROADMAP_ID) ?? '').trim();
};

/**
 * Sets the view drag payload on a DataTransfer during `onDragStart`.
 */
export const setViewDragPayload = (
  dataTransfer: DataTransfer,
  viewId: string,
): void => {
  dataTransfer.setData(DRAG_MIME_VIEW_ID, viewId);
  dataTransfer.setData('text/plain', `view:${viewId}`);
  dataTransfer.effectAllowed = 'copy';
  dataTransfer.dropEffect = 'copy';
};

/**
 * Sets the roadmap drag payload on a DataTransfer during `onDragStart`.
 */
export const setRoadmapDragPayload = (
  dataTransfer: DataTransfer,
  roadmapId: string,
): void => {
  dataTransfer.setData(DRAG_MIME_ROADMAP_ID, roadmapId);
  dataTransfer.setData('text/plain', `roadmap:${roadmapId}`);
  dataTransfer.effectAllowed = 'copy';
  dataTransfer.dropEffect = 'copy';
};
