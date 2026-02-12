/**
 * Context Menu — Action Handlers
 *
 * Spec §10 Event Flow:
 *   ON menu_action_click:
 *     1. Validate permission
 *     2. Execute action handler
 *     3. Begin transaction
 *     4. Update repository
 *     5. Write audit log
 *     6. Emit event
 *     7. Close menu (handled by Provider before this is called)
 *
 * This module provides a default action handler factory that integrates
 * with the explorer event bus, audit log, and IDE command system.
 * Individual surfaces (Explorer, Canvas, Grid) extend or override
 * specific action keys.
 */

import { dispatchIdeCommand } from '@/ide/ideCommands';
import type { MenuContext } from './contextMenuEngine';

/**
 * Default global action handler.
 * Routes common actions across all surfaces.
 * Surfaces should compose this with their own handlers.
 */
export function createGlobalActionHandler(
  surfaceHandlers: Record<string, (ctx: MenuContext) => void>,
): (key: string, ctx: MenuContext) => void {
  return (key: string, ctx: MenuContext) => {
    // Check surface-specific handler first
    const surfaceHandler = surfaceHandlers[key];
    if (surfaceHandler) {
      surfaceHandler(ctx);
      return;
    }

    // Global fallback handlers for common actions
    switch (key) {
      case 'refresh':
        window.dispatchEvent(new Event('ea:repositoryChanged'));
        break;

      case 'goto':
        if (ctx.nodeId) {
          dispatchIdeCommand({ type: 'view.showActivity', activity: 'explorer' });
        }
        break;

      case 'zoom-in':
        window.dispatchEvent(new CustomEvent('ea:studio.canvas.zoom', { detail: { direction: 'in' } }));
        break;

      case 'zoom-out':
        window.dispatchEvent(new CustomEvent('ea:studio.canvas.zoom', { detail: { direction: 'out' } }));
        break;

      case 'auto-layout':
        window.dispatchEvent(new CustomEvent('ea:studio.canvas.autoLayout'));
        break;

      case 'close-tab':
        if (ctx.viewId) {
          dispatchIdeCommand({ type: 'workspace.closeMatchingTabs', prefix: `studio:view:${ctx.viewId}` });
        }
        break;

      case 'close-other-tabs':
        // Signal to tab manager
        window.dispatchEvent(new CustomEvent('ea:tabs.closeOthers', { detail: { keepViewId: ctx.viewId } }));
        break;

      case 'close-all-tabs':
        dispatchIdeCommand({ type: 'workspace.resetTabs' });
        break;

      default:
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[ContextMenu] Unhandled action: "${key}" for source: ${ctx.source}`);
        }
        break;
    }
  };
}
