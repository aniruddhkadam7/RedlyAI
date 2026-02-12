/**
 * Global Context Menu Registry — Capability-driven menu definitions
 *
 * Spec §6: "No hardcoded menu inside UI components.
 *           Menu must be generated from capability registry."
 *
 * This file registers menu providers for each ContextSource.
 * Each provider returns MenuItem[] based on the MenuContext.
 *
 * Providers are registered at import time so they are available
 * immediately when the engine's buildMenu() is called.
 *
 * SECTIONS:
 *   §2 — Explorer Node
 *   §3 — Canvas Element
 *   §4 — Canvas Empty Space
 *   §5 — Grid / Catalogue
 *   §6 — Diagram Tab
 *   §7 — Inspector
 */

import type { MenuItem, MenuContext } from './contextMenuEngine';
import { registerMenuProvider } from './contextMenuEngine';

// ---------------------------------------------------------------------------
// Helper: divider sentinel
// ---------------------------------------------------------------------------
const DIVIDER: MenuItem = { key: '__divider__', label: '', divider: true };

const divider = (): MenuItem => ({ ...DIVIDER, key: `__div_${Math.random().toString(36).slice(2)}__` });

// =========================================================================
// §2 EXPLORER NODE
// =========================================================================

function explorerNodeProvider(ctx: MenuContext): MenuItem[] {
  const kind = ctx.nodeKind ?? 'unknown';

  switch (kind) {
    case 'folder':
      return buildFolderMenu(ctx);
    case 'element':
      return buildElementMenu(ctx);
    case 'diagram':
      return buildDiagramMenu(ctx);
    default:
      return buildDefaultExplorerMenu(ctx);
  }
}

function buildFolderMenu(ctx: MenuContext): MenuItem[] {
  return [
    { key: 'goto',             label: 'Go To',         icon: 'ArrowRightOutlined', shortcut: 'Enter' },
    { key: 'create-element',   label: 'Create New',    icon: 'PlusOutlined',       requiredPermission: 'createElement' },
    { key: 'import',           label: 'Import',        icon: 'ImportOutlined',     requiredPermission: 'import' },
    { key: 'export-folder',    label: 'Export',        icon: 'ExportOutlined' },
    { key: 'paste',            label: 'Paste',         icon: 'SnippetsOutlined',   requiredPermission: 'createElement', shortcut: 'Ctrl+V' },
    divider(),
    { key: 'sort-asc',         label: 'Sort A → Z',    icon: 'SortAscendingOutlined' },
    { key: 'sort-desc',        label: 'Sort Z → A',    icon: 'SortDescendingOutlined' },
    divider(),
    { key: 'folder-properties', label: 'Properties',   icon: 'InfoCircleOutlined' },
  ];
}

function buildElementMenu(ctx: MenuContext): MenuItem[] {
  return [
    { key: 'goto',               label: 'Go To',                   icon: 'ArrowRightOutlined',    shortcut: 'Enter' },
    { key: 'create-relationship', label: 'Connect',                 icon: 'ApiOutlined',           requiredPermission: 'createRelationship' },
    { key: 'add-sub-component',  label: 'Add Sub-Component',       icon: 'SubnodeOutlined',       requiredPermission: 'createElement' },
    { key: 'add-from-template',  label: 'Add From Template',       icon: 'FileAddOutlined',       requiredPermission: 'createElement' },
    divider(),
    { key: 'import',             label: 'Import',                  icon: 'ImportOutlined',        requiredPermission: 'import' },
    { key: 'export-element',     label: 'Export',                  icon: 'ExportOutlined' },
    { key: 'audit-trail',        label: 'Audit Trail',             icon: 'AuditOutlined' },
    divider(),
    { key: 'create-drilldown',   label: 'Create Drill-Down Diagram', icon: 'PartitionOutlined',  requiredPermission: 'createView' },
    { key: 'change-parent',      label: 'Change Parent',           icon: 'DragOutlined',          requiredPermission: 'editElement' },
    { key: 'copy',               label: 'Copy',                    icon: 'CopyOutlined',          shortcut: 'Ctrl+C' },
    { key: 'delete-element',     label: 'Delete',                  icon: 'DeleteOutlined',        requiredPermission: 'deleteElement', shortcut: 'Del', danger: true },
    { key: 'rename-element',     label: 'Rename',                  icon: 'EditOutlined',          requiredPermission: 'editElement', shortcut: 'F2' },
    divider(),
    { key: 'diff-sync',          label: 'Diff / Sync',             icon: 'SwapOutlined' },
    { key: 'change-sync-target', label: 'Change Sync Target',      icon: 'LinkOutlined' },
    { key: 'check-constraints',  label: 'Check Constraints',       icon: 'SafetyCertificateOutlined' },
    { key: 'aggregate-props',    label: 'Aggregate Properties',    icon: 'CalculatorOutlined' },
    { key: 'edit-standards',     label: 'Edit Standards',          icon: 'FileProtectOutlined',   requiredPermission: 'editElement' },
    { key: 'change-type',        label: 'Change Type',             icon: 'SwapOutlined',          requiredPermission: 'editElement' },
    divider(),
    { key: 'expand-node',        label: 'Expand',                  icon: 'PlusSquareOutlined' },
    { key: 'collapse-node',      label: 'Collapse',                icon: 'MinusSquareOutlined' },
    { key: 'sort-children',      label: 'Sort',                    icon: 'SortAscendingOutlined', children: [
      { key: 'sort-asc', label: 'A → Z', icon: 'SortAscendingOutlined' },
      { key: 'sort-desc', label: 'Z → A', icon: 'SortDescendingOutlined' },
    ]},
  ];
}

function buildDiagramMenu(ctx: MenuContext): MenuItem[] {
  return [
    { key: 'open-view',        label: 'Open',         icon: 'FolderOpenOutlined', shortcut: 'Enter' },
    { key: 'rename-view',      label: 'Rename',       icon: 'EditOutlined',       requiredPermission: 'editView', shortcut: 'F2' },
    { key: 'duplicate-view',   label: 'Duplicate',    icon: 'CopyOutlined',       requiredPermission: 'createView' },
    { key: 'export-view',      label: 'Export',       icon: 'ExportOutlined',     children: [
      { key: 'export-view-png',  label: 'Export as PNG',  icon: 'FileImageOutlined' },
      { key: 'export-view-json', label: 'Export as JSON', icon: 'FileTextOutlined' },
    ]},
    divider(),
    { key: 'delete-view',      label: 'Delete',       icon: 'DeleteOutlined', requiredPermission: 'editView', danger: true },
    { key: 'view-properties',  label: 'Properties',   icon: 'InfoCircleOutlined' },
  ];
}

function buildDefaultExplorerMenu(_ctx: MenuContext): MenuItem[] {
  return [
    { key: 'refresh', label: 'Refresh', icon: 'ReloadOutlined' },
  ];
}

registerMenuProvider('explorer_node', explorerNodeProvider);

// =========================================================================
// §3 CANVAS ELEMENT
// =========================================================================

function canvasElementProvider(ctx: MenuContext): MenuItem[] {
  return [
    { key: 'open-in-explorer',     label: 'Open in Explorer',     icon: 'FolderOpenOutlined' },
    { key: 'rename-element',       label: 'Rename',               icon: 'EditOutlined',       requiredPermission: 'editElement', shortcut: 'F2' },
    { key: 'create-relationship',  label: 'Create Relationship',  icon: 'ApiOutlined',        requiredPermission: 'createRelationship' },
    { key: 'view-dependencies',    label: 'View Dependencies',    icon: 'ClusterOutlined' },
    { key: 'add-sub-component',    label: 'Add Sub-Component',    icon: 'SubnodeOutlined',    requiredPermission: 'createElement' },
    divider(),
    { key: 'remove-from-diagram',  label: 'Remove from Diagram',  icon: 'DisconnectOutlined', shortcut: 'Backspace' },
    { key: 'delete-element',       label: 'Delete from Repository', icon: 'DeleteOutlined',   requiredPermission: 'deleteElement', danger: true, shortcut: 'Del' },
    divider(),
    { key: 'open-properties',      label: 'Properties',           icon: 'InfoCircleOutlined' },
  ];
}

registerMenuProvider('canvas_element', canvasElementProvider);

// =========================================================================
// §4 CANVAS EMPTY SPACE
// =========================================================================

function canvasEmptySpaceProvider(ctx: MenuContext): MenuItem[] {
  return [
    { key: 'create-element',      label: 'Create New Element', icon: 'PlusOutlined',        requiredPermission: 'createElement' },
    { key: 'paste',               label: 'Paste',             icon: 'SnippetsOutlined',     requiredPermission: 'createElement', shortcut: 'Ctrl+V' },
    divider(),
    { key: 'auto-layout',         label: 'Auto Layout',       icon: 'AppstoreOutlined' },
    { key: 'zoom-in',             label: 'Zoom In',           icon: 'ZoomInOutlined',       shortcut: 'Ctrl+=' },
    { key: 'zoom-out',            label: 'Zoom Out',          icon: 'ZoomOutOutlined',      shortcut: 'Ctrl+-' },
    divider(),
    { key: 'diagram-properties',  label: 'Diagram Properties', icon: 'SettingOutlined' },
  ];
}

registerMenuProvider('canvas_empty_space', canvasEmptySpaceProvider);

// =========================================================================
// §5 GRID / CATALOGUE
// =========================================================================

function gridRowProvider(ctx: MenuContext): MenuItem[] {
  return [
    { key: 'open-row',       label: 'Open',         icon: 'FolderOpenOutlined',  shortcut: 'Enter' },
    { key: 'edit-row',       label: 'Edit',         icon: 'EditOutlined',        requiredPermission: 'editElement' },
    { key: 'delete-row',     label: 'Delete',       icon: 'DeleteOutlined',      requiredPermission: 'deleteElement', danger: true },
    divider(),
    { key: 'export-row',     label: 'Export Row',   icon: 'ExportOutlined' },
    { key: 'audit-trail',    label: 'Audit Trail',  icon: 'AuditOutlined' },
  ];
}

registerMenuProvider('grid_row', gridRowProvider);

// =========================================================================
// §6 DIAGRAM TAB (tab strip right-click)
// =========================================================================

function diagramTabProvider(ctx: MenuContext): MenuItem[] {
  return [
    { key: 'close-tab',         label: 'Close',              icon: 'CloseOutlined' },
    { key: 'close-other-tabs',  label: 'Close Others',       icon: 'CloseCircleOutlined' },
    { key: 'close-all-tabs',    label: 'Close All',          icon: 'StopOutlined' },
    divider(),
    { key: 'rename-view',       label: 'Rename',             icon: 'EditOutlined',   requiredPermission: 'editView' },
    { key: 'duplicate-view',    label: 'Duplicate',          icon: 'CopyOutlined',   requiredPermission: 'createView' },
    divider(),
    { key: 'view-properties',   label: 'Properties',         icon: 'InfoCircleOutlined' },
  ];
}

registerMenuProvider('diagram_tab', diagramTabProvider);

// =========================================================================
// §7 INSPECTOR (properties panel right-click)
// =========================================================================

function inspectorProvider(ctx: MenuContext): MenuItem[] {
  return [
    { key: 'copy-value',       label: 'Copy Value',       icon: 'CopyOutlined',    shortcut: 'Ctrl+C' },
    { key: 'edit-field',       label: 'Edit',             icon: 'EditOutlined',    requiredPermission: 'editElement' },
    { key: 'reset-field',      label: 'Reset to Default', icon: 'UndoOutlined',    requiredPermission: 'editElement' },
    divider(),
    { key: 'audit-trail',      label: 'Audit Trail',      icon: 'AuditOutlined' },
    { key: 'open-properties',  label: 'Full Properties',  icon: 'InfoCircleOutlined' },
  ];
}

registerMenuProvider('inspector', inspectorProvider);
