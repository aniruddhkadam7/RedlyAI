/**
 * Context Menu Provider — React context that holds menu state + action dispatch.
 *
 * Provides:
 *   - open(ctx, onAction) — triggers the global menu at cursor position
 *   - close() — dismisses the menu
 *   - handleAction(key) — delegates to the caller-provided onAction
 *   - state — current menu state (items, position, context)
 *
 * Also exports the `useContextMenu` hook and a convenience
 * `useContextMenuTrigger` hook for wiring right-click handlers.
 *
 * Mounted once at root level via `<ContextMenuGate>`.
 */

import React from 'react';

import type { MenuContext, MenuItem } from './contextMenuEngine';
import { buildMenu } from './contextMenuEngine';

// Ensure registry side-effects run (providers are registered at import time)
import './contextMenuRegistry';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface ContextMenuState {
  items: MenuItem[];
  position: { x: number; y: number };
  context: MenuContext;
}

type ActionHandler = (key: string, ctx: MenuContext) => void;

interface ContextMenuAPI {
  /** Current menu state (null = closed) */
  state: ContextMenuState | null;
  /** Open the menu: builds items from the engine, stores position & callback */
  open: (ctx: MenuContext, onAction: ActionHandler) => void;
  /** Close the menu */
  close: () => void;
  /** Called by MenuItem click — routes to the stored onAction callback */
  handleAction: (key: string) => void;
}

const ContextMenuCtx = React.createContext<ContextMenuAPI | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const ContextMenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [menuState, setMenuState] = React.useState<ContextMenuState | null>(null);
  const handlerRef = React.useRef<ActionHandler | null>(null);
  const ctxRef = React.useRef<MenuContext | null>(null);

  const open = React.useCallback((ctx: MenuContext, onAction: ActionHandler) => {
    const items = buildMenu(ctx);
    if (items.length === 0) return; // nothing to show
    handlerRef.current = onAction;
    ctxRef.current = ctx;
    setMenuState({ items, position: { x: ctx.x, y: ctx.y }, context: ctx });
  }, []);

  const close = React.useCallback(() => {
    setMenuState(null);
    handlerRef.current = null;
    ctxRef.current = null;
  }, []);

  const handleAction = React.useCallback((key: string) => {
    const fn = handlerRef.current;
    const ctx = ctxRef.current;
    // Close first (spec §10 — close menu before executing action)
    close();
    if (fn && ctx) {
      try { fn(key, ctx); } catch (err) {
        console.error('[ContextMenu] action handler error:', err);
      }
    }
  }, [close]);

  const api = React.useMemo<ContextMenuAPI>(
    () => ({ state: menuState, open, close, handleAction }),
    [menuState, open, close, handleAction],
  );

  return (
    <ContextMenuCtx.Provider value={api}>
      {children}
    </ContextMenuCtx.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Access the context menu API from any component.
 */
export function useContextMenu(): ContextMenuAPI {
  const api = React.useContext(ContextMenuCtx);
  if (!api) throw new Error('useContextMenu must be used within <ContextMenuProvider>');
  return api;
}

/**
 * Convenience hook: returns a `onContextMenu` handler that opens the global
 * context menu with the given context builder, plus handles default prevention.
 *
 * Usage:
 *   const trigger = useContextMenuTrigger(
 *     (e) => ({ source: 'grid_row', nodeId: record.id, ... }),
 *     (key, ctx) => { ... handle action ... }
 *   );
 *   <tr onContextMenu={trigger} />
 */
export function useContextMenuTrigger(
  buildContext: (e: React.MouseEvent) => Omit<MenuContext, 'x' | 'y'>,
  onAction: ActionHandler,
): (e: React.MouseEvent) => void {
  const { open } = useContextMenu();

  return React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const partial = buildContext(e);
    const ctx: MenuContext = { ...partial, x: e.clientX, y: e.clientY } as MenuContext;
    open(ctx, onAction);
  }, [buildContext, onAction, open]);
}
