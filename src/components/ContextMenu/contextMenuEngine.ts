/**
 * Global Context Menu Engine
 *
 * Spec §6 — ContextMenuEngine:
 *   INPUT:  context_type, node_id, user_permissions
 *   PROCESS: fetch allowed actions, filter by permission, filter by node capability, render menu model
 *   OUTPUT: MenuItem[] { label, action, icon, shortcut, children?, disabled? }
 *
 * Spec §8 — Performance: No synchronous DB calls, menu generation <5ms.
 *
 * This module is the single entry point for ALL context menus in the app.
 * It delegates to the capability registry (contextMenuRegistry.ts) and
 * the permission guard (explorerPermissions.ts).
 *
 * No hardcoded menus inside UI components — all menus are generated here.
 */

import type { RepositoryRole } from '@/repository/accessControl';
import { hasRepositoryPermission } from '@/repository/accessControl';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Where the right-click originated */
export type ContextSource =
  | 'explorer_node'
  | 'canvas_element'
  | 'canvas_empty_space'
  | 'grid_row'
  | 'diagram_tab'
  | 'inspector';

/** Resolved context passed through the engine */
export interface MenuContext {
  source: ContextSource;

  /** Arbitrary payload describing the right-clicked target */
  nodeId?: string;
  nodeType?: string;
  nodeKind?: string; // folder / element / diagram / catalog / ...
  nodeName?: string;

  /** For canvas contexts */
  viewId?: string;

  /** For grid contexts */
  rowId?: string;
  rowType?: string;

  /** Cursor position (viewport coords) */
  x: number;
  y: number;

  /** Permissions */
  role: RepositoryRole;

  /** Any extra data the caller wants to pass through */
  extra?: Record<string, unknown>;
}

/** A single menu item produced by the engine */
export interface MenuItem {
  /** Unique action key used to dispatch the handler */
  key: string;
  /** Display label */
  label: string;
  /** Ant Design icon name (string) or React node — kept as string for serialisability */
  icon?: string;
  /** Keyboard shortcut hint text (e.g. "Del", "F2") */
  shortcut?: string;
  /** Nested submenu items */
  children?: MenuItem[];
  /** Render as disabled (grayed out) but still visible */
  disabled?: boolean;
  /** Divider sentinel — when true, renders a horizontal line */
  divider?: boolean;
  /** Permission required — items failing the check are hidden entirely */
  requiredPermission?: string;
  /** If true, item is shown but greyed-out when permission fails (instead of hidden) */
  showDisabledWhenUnauthorized?: boolean;
  /** Danger styling (red text) */
  danger?: boolean;
}

/** Provider function registered per ContextSource in the registry */
export type MenuProvider = (ctx: MenuContext) => MenuItem[];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Registry of menu providers keyed by ContextSource.
 * Populated by contextMenuRegistry.ts at import time.
 */
const providers = new Map<ContextSource, MenuProvider>();

export function registerMenuProvider(source: ContextSource, provider: MenuProvider): void {
  providers.set(source, provider);
}

/**
 * Build a context menu for the given context.
 *
 * 1. Look up the registered provider for ctx.source
 * 2. Call provider to get raw MenuItem[]
 * 3. Filter by permission (hide or disable)
 * 4. Return the filtered list
 *
 * Guaranteed < 5ms — no I/O, no DB, pure in-memory.
 */
export function buildMenu(ctx: MenuContext): MenuItem[] {
  const provider = providers.get(ctx.source);
  if (!provider) return [];

  const raw = provider(ctx);
  return filterByPermission(raw, ctx.role);
}

// ---------------------------------------------------------------------------
// Permission Filter (recursive for submenus)
// ---------------------------------------------------------------------------

function filterByPermission(items: MenuItem[], role: RepositoryRole): MenuItem[] {
  const result: MenuItem[] = [];
  for (const item of items) {
    // Dividers pass through
    if (item.divider) { result.push(item); continue; }

    // Permission check
    if (item.requiredPermission) {
      const allowed = hasRepositoryPermission(role, item.requiredPermission);
      if (!allowed) {
        if (item.showDisabledWhenUnauthorized) {
          result.push({ ...item, disabled: true, children: undefined });
        }
        // else: hidden entirely
        continue;
      }
    }

    // Recurse into children
    if (item.children?.length) {
      const filteredChildren = filterByPermission(item.children, role);
      if (filteredChildren.length === 0) continue; // skip empty submenus
      result.push({ ...item, children: filteredChildren });
    } else {
      result.push(item);
    }
  }

  // Strip trailing/leading/consecutive dividers
  return cleanDividers(result);
}

function cleanDividers(items: MenuItem[]): MenuItem[] {
  const cleaned: MenuItem[] = [];
  let lastWasDivider = true; // true to strip leading
  for (const item of items) {
    if (item.divider) {
      if (lastWasDivider) continue; // skip consecutive
      lastWasDivider = true;
    } else {
      lastWasDivider = false;
    }
    cleaned.push(item);
  }
  // strip trailing
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].divider) cleaned.pop();
  return cleaned;
}

// ---------------------------------------------------------------------------
// Position Adjustment (spec §9)
// ---------------------------------------------------------------------------

export interface MenuPosition { x: number; y: number }

const MENU_WIDTH_ESTIMATE = 220;
const MENU_HEIGHT_ESTIMATE = 320;

/**
 * Adjust menu position so it doesn't overflow the viewport.
 */
export function adjustMenuPosition(pos: MenuPosition, menuWidth?: number, menuHeight?: number): MenuPosition {
  const w = menuWidth ?? MENU_WIDTH_ESTIMATE;
  const h = menuHeight ?? MENU_HEIGHT_ESTIMATE;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;

  let { x, y } = pos;
  if (x + w > vw) x = Math.max(0, vw - w);
  if (y + h > vh) y = Math.max(0, vh - h);
  return { x, y };
}
