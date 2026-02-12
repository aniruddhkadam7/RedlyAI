/**
 * ViewOpenService — single-responsibility service for opening views in Studio.
 *
 * Responsibilities:
 * - Decide whether a view should open in a new or existing tab.
 * - Dispatch the standardised `ea:studio.view.open` event.
 * - Validate preconditions (view exists, repository loaded).
 *
 * This service has NO UI, NO React dependency, and NO direct state mutation.
 * It communicates purely through the existing window event bus.
 */

import { ViewStore } from '../view-runtime/ViewStore';

export type ViewOpenResult =
  | { outcome: 'opened'; viewId: string }
  | { outcome: 'activated'; viewId: string }
  | { outcome: 'error'; viewId: string; reason: string };

/**
 * Dispatch the `ea:studio.view.open` event.
 * Both `IdeShellLayout/index.tsx` and `StudioShell.tsx` listen for this
 * event and will handle tab creation / activation via `ensureViewTab`.
 */
const dispatchViewOpen = (
  viewId: string,
  opts?: { readOnly?: boolean; openMode?: 'new' | 'replace' | 'existing' },
): void => {
  window.dispatchEvent(
    new CustomEvent('ea:studio.view.open', {
      detail: {
        viewId,
        readOnly: opts?.readOnly,
        openMode: opts?.openMode ?? 'existing',
      },
    }),
  );
};

export const ViewOpenService = {
  /**
   * Open a view in the Studio.
   *
   * Flow:
   * 1. If `viewId` is falsy → return error.
   * 2. If view not found in `ViewStore` → return error.
   * 3. Dispatch `ea:studio.view.open` with mode `'existing'`.
   *    - StudioShell's `ensureViewTab` handles deduplication:
   *      • If already open → activates the existing tab.
   *      • If not open → creates a new tab.
   *
   * @param viewId  The unique ID of the saved view.
   * @param opts    Optional flags (readOnly, etc.)
   */
  open(viewId: string, opts?: { readOnly?: boolean }): ViewOpenResult {
    if (!viewId) {
      return { outcome: 'error', viewId: '', reason: 'Missing viewId.' };
    }

    const view = ViewStore.get(viewId);
    if (!view) {
      return {
        outcome: 'error',
        viewId,
        reason: `View "${viewId}" not found in repository.`,
      };
    }

    // Dispatch the standard event — ensureViewTab handles tab deduplication.
    // Using 'existing' mode: activates existing tab if present, otherwise creates new.
    dispatchViewOpen(viewId, {
      readOnly: opts?.readOnly,
      openMode: 'existing',
    });

    return { outcome: 'opened', viewId };
  },

  /**
   * Check if a view ID points to a valid, loadable saved view.
   */
  exists(viewId: string): boolean {
    if (!viewId) return false;
    return ViewStore.get(viewId) != null;
  },

  /**
   * Open a view in a guaranteed NEW tab (never replaces an existing one).
   */
  openInNewTab(viewId: string, opts?: { readOnly?: boolean }): ViewOpenResult {
    if (!viewId) {
      return { outcome: 'error', viewId: '', reason: 'Missing viewId.' };
    }

    const view = ViewStore.get(viewId);
    if (!view) {
      return {
        outcome: 'error',
        viewId,
        reason: `View "${viewId}" not found in repository.`,
      };
    }

    dispatchViewOpen(viewId, {
      readOnly: opts?.readOnly,
      openMode: 'new',
    });

    return { outcome: 'opened', viewId };
  },
} as const;
