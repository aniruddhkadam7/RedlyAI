/**
 * ContextMenu — barrel export
 *
 * Public API:
 *   - ContextMenuProvider: wrap at app root
 *   - GlobalContextMenu: render once at app root
 *   - useContextMenu: access menu API
 *   - useContextMenuTrigger: convenience hook for onContextMenu
 *   - buildMenu, registerMenuProvider: engine
 *   - createGlobalActionHandler: action handler factory
 *   - Types: ContextSource, MenuContext, MenuItem, MenuProvider
 */

// Engine
export {
  buildMenu,
  registerMenuProvider,
  adjustMenuPosition,
  type ContextSource,
  type MenuContext,
  type MenuItem,
  type MenuProvider,
  type MenuPosition,
} from './contextMenuEngine';

// Registry (side-effect: registers all providers)
import './contextMenuRegistry';

// Provider + hooks
export {
  ContextMenuProvider,
  useContextMenu,
  useContextMenuTrigger,
} from './ContextMenuProvider';

// Rendered overlay
export { default as GlobalContextMenu } from './GlobalContextMenu';

// Action handler factory
export { createGlobalActionHandler } from './contextMenuActions';
