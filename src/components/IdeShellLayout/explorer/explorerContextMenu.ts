/**
 * Explorer Context Menu — Enterprise-Grade, Permission-Aware
 *
 * SPEC §3 — Dynamic context menus based on node type + permissions:
 *
 * folder:   Create New | Import | Paste | Refresh | Sort | Properties
 * element:  Open | Rename | Duplicate | Change Type | Move To… |
 *           Create Relationship | Add to Diagram | View Dependencies |
 *           Compare with Baseline | Delete | Audit Trail | Properties
 * diagram:  Open | Rename | Duplicate | Export | Delete | Properties
 *
 * Hide options if user lacks permission.
 */

import type { MenuProps } from 'antd';
import type { RepositoryRole } from '@/repository/accessControl';
import { canPerform, type ExplorerAction } from './explorerPermissions';
import { EXPLORER_KEYS } from './explorerNodeRegistry';

// ---------------------------------------------------------------------------
// Action Definitions
// ---------------------------------------------------------------------------

export type ExplorerMenuAction =
  // Global
  | { type: 'refresh' }
  | { type: 'noop' }
  // Folder actions
  | { type: 'create-element'; parentKey?: string; allowedTypes?: readonly string[] }
  | { type: 'import'; parentKey?: string }
  | { type: 'paste'; parentKey?: string }
  | { type: 'sort'; parentKey?: string; direction: 'asc' | 'desc' }
  | { type: 'folder-properties'; key: string }
  // Element actions
  | { type: 'open-properties'; elementId: string; elementType: string }
  | { type: 'rename-element'; elementId: string; elementName: string; elementType: string }
  | { type: 'duplicate-element'; elementId: string }
  | { type: 'change-type'; elementId: string; elementType: string; elementName: string }
  | { type: 'move-to'; elementId: string; elementType: string; elementName: string }
  | { type: 'create-relationship'; sourceId: string; sourceName: string; sourceType: string }
  | { type: 'add-to-view'; elementId: string; elementName: string; elementType: string }
  | { type: 'view-dependencies'; elementId: string; elementName: string; elementType: string }
  | { type: 'compare-baseline'; elementId: string; elementName: string }
  | { type: 'delete-element'; elementId: string }
  | { type: 'audit-trail'; objectId: string }
  | { type: 'impact-analysis'; elementId: string; elementName: string; elementType: string }
  // Diagram / view actions
  | { type: 'open-view'; viewId: string }
  | { type: 'open-view-studio'; viewId: string; openMode: 'replace' | 'new' }
  | { type: 'rename-view'; viewId: string }
  | { type: 'duplicate-view'; viewId: string }
  | { type: 'export-view'; viewId: string; format: 'png' | 'json' }
  | { type: 'delete-view'; viewId: string }
  | { type: 'view-properties'; viewId: string }
  // Baseline
  | { type: 'open-baseline'; baselineId: string }
  | { type: 'preview-baseline'; baselineId: string }
  | { type: 'create-baseline' }
  // Roadmap / Plateau
  | { type: 'open-roadmap'; roadmapId: string }
  | { type: 'open-plateau'; plateauId: string }
  // Catalog / Matrix / Report / Setting
  | { type: 'open-catalog'; catalogKey: string }
  | { type: 'open-matrix'; matrixKey: string }
  | { type: 'open-report'; reportType: string }
  | { type: 'open-setting'; settingKey: string }
  | { type: 'initialize-enterprise' };

// ---------------------------------------------------------------------------
// Internal menu item definition with permission tagging
// ---------------------------------------------------------------------------

type MenuItemDef = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  action: ExplorerMenuAction;
  /** If set, item is hidden when user cannot perform this action. */
  requiredAction?: ExplorerAction;
  divider?: boolean;
  children?: MenuItemDef[];
};

// ---------------------------------------------------------------------------
// Conversion: MenuItemDef[] → Ant Design MenuProps
// ---------------------------------------------------------------------------

function toAntdMenu(
  allItems: MenuItemDef[],
  onAction: (action: ExplorerMenuAction) => void,
  role: RepositoryRole,
): MenuProps {
  // Filter by permission
  const items = allItems.filter(item => {
    if (!item.requiredAction) return true;
    return canPerform(role, item.requiredAction);
  });

  const actionMap = new Map<string, ExplorerMenuAction>();

  const convert = (defs: MenuItemDef[]): MenuProps['items'] => {
    const result: NonNullable<MenuProps['items']> = [];
    defs.forEach((def, idx) => {
      // Insert divider before this item if flagged
      if (def.divider && idx > 0) {
        result.push({ type: 'divider' as const, key: `divider-${def.key}` });
      }
      actionMap.set(def.key, def.action);
      if (def.children) {
        const filtered = def.children.filter(c => !c.requiredAction || canPerform(role, c.requiredAction));
        result.push({
          key: def.key,
          label: def.label,
          icon: def.icon,
          disabled: def.disabled,
          danger: def.danger,
          children: convert(filtered),
        });
      } else {
        result.push({
          key: def.key,
          label: def.label,
          icon: def.icon,
          disabled: def.disabled,
          danger: def.danger,
        });
      }
    });
    return result;
  };

  return {
    items: convert(items),
    onClick: ({ key }) => {
      const action = actionMap.get(key);
      if (action) onAction(action);
    },
  };
}

// ---------------------------------------------------------------------------
// Node-type classification helpers
// ---------------------------------------------------------------------------

export type ExplorerNodeKind = 'folder' | 'element' | 'diagram' | 'baseline' | 'roadmap' | 'plateau' | 'catalog' | 'matrix' | 'report' | 'setting' | 'relationship' | 'metamodel-type' | 'unknown';

export function classifyNodeKey(
  key: string,
  nodeData?: Record<string, unknown>,
): ExplorerNodeKind {
  if (key.startsWith('element:')) return 'element';
  if (key.startsWith('view:')) return 'diagram';
  if (key.startsWith('baseline:')) return 'baseline';
  if (key.startsWith('roadmap:') && nodeData?.roadmapId) return 'roadmap';
  if (key.startsWith('plateau:')) return 'plateau';
  if (key.startsWith('relationship:')) return 'relationship';
  if (key.startsWith('metamodel:type:') || key.startsWith('metamodel:reldef:')) return 'metamodel-type';
  if (nodeData?.catalogKey) return 'catalog';
  if (nodeData?.matrixKey) return 'matrix';
  if (nodeData?.reportType) return 'report';
  if (nodeData?.settingKey) return 'setting';
  return 'folder';
}

// ---------------------------------------------------------------------------
// Menu Builders per Node Kind
// ---------------------------------------------------------------------------

function buildFolderMenu(key: string): MenuItemDef[] {
  return [
    { key: 'create-new', label: 'Create New…', action: { type: 'create-element', parentKey: key }, requiredAction: 'createElement' },
    { key: 'import', label: 'Import…', action: { type: 'import', parentKey: key }, requiredAction: 'import' },
    { key: 'paste', label: 'Paste', action: { type: 'paste', parentKey: key }, requiredAction: 'paste' },
    { key: 'refresh', label: 'Refresh', action: { type: 'refresh' }, divider: true },
    { key: 'sort-asc', label: 'Sort A → Z', action: { type: 'sort', parentKey: key, direction: 'asc' }, requiredAction: 'sort' },
    { key: 'sort-desc', label: 'Sort Z → A', action: { type: 'sort', parentKey: key, direction: 'desc' }, requiredAction: 'sort' },
    { key: 'properties', label: 'Properties', action: { type: 'folder-properties', key }, divider: true },
  ];
}

function buildElementMenu(
  elementId: string,
  elementType: string,
  elementName: string,
): MenuItemDef[] {
  return [
    { key: 'open', label: 'Open', action: { type: 'open-properties', elementId, elementType } },
    { key: 'rename', label: 'Rename', action: { type: 'rename-element', elementId, elementName, elementType }, requiredAction: 'renameElement' },
    { key: 'duplicate', label: 'Duplicate', action: { type: 'duplicate-element', elementId }, requiredAction: 'duplicateElement' },
    { key: 'change-type', label: 'Change Type…', action: { type: 'change-type', elementId, elementType, elementName }, requiredAction: 'changeType', divider: true },
    { key: 'move-to', label: 'Move To…', action: { type: 'move-to', elementId, elementType, elementName }, requiredAction: 'moveElement' },
    { key: 'create-rel', label: 'Create Relationship…', action: { type: 'create-relationship', sourceId: elementId, sourceName: elementName, sourceType: elementType }, requiredAction: 'createRelationship', divider: true },
    { key: 'add-to-diagram', label: 'Add to Diagram…', action: { type: 'add-to-view', elementId, elementName, elementType }, requiredAction: 'editView' },
    { key: 'view-deps', label: 'View Dependencies', action: { type: 'view-dependencies', elementId, elementName, elementType }, requiredAction: 'viewDependencies' },
    { key: 'compare-baseline', label: 'Compare with Baseline', action: { type: 'compare-baseline', elementId, elementName }, requiredAction: 'compareBaseline', divider: true },
    { key: 'delete', label: 'Delete', danger: true, action: { type: 'delete-element', elementId }, requiredAction: 'deleteElement', divider: true },
    { key: 'audit', label: 'Audit Trail', action: { type: 'audit-trail', objectId: elementId }, requiredAction: 'auditTrail' },
    { key: 'properties', label: 'Properties', action: { type: 'open-properties', elementId, elementType } },
  ];
}

function buildDiagramMenu(viewId: string): MenuItemDef[] {
  return [
    { key: 'open', label: 'Open', action: { type: 'open-view', viewId } },
    { key: 'open-studio', label: 'Edit in Studio', action: { type: 'open-view-studio', viewId, openMode: 'replace' }, requiredAction: 'editView' },
    { key: 'rename', label: 'Rename', action: { type: 'rename-view', viewId }, requiredAction: 'renameView', divider: true },
    { key: 'duplicate', label: 'Duplicate', action: { type: 'duplicate-view', viewId }, requiredAction: 'duplicateView' },
    { key: 'export', label: 'Export', action: { type: 'noop' }, children: [
      { key: 'export-png', label: 'Export as PNG', action: { type: 'export-view', viewId, format: 'png' }, requiredAction: 'exportView' },
      { key: 'export-json', label: 'Export as JSON', action: { type: 'export-view', viewId, format: 'json' }, requiredAction: 'exportView' },
    ]},
    { key: 'delete', label: 'Delete', danger: true, action: { type: 'delete-view', viewId }, requiredAction: 'deleteView', divider: true },
    { key: 'properties', label: 'Properties', action: { type: 'view-properties', viewId } },
  ];
}

function buildBaselineMenu(baselineId: string): MenuItemDef[] {
  return [
    { key: 'open', label: 'Open Baseline (read-only)', action: { type: 'open-baseline', baselineId } },
    { key: 'preview', label: 'Preview Metadata', action: { type: 'preview-baseline', baselineId } },
    { key: 'audit', label: 'Audit Trail', action: { type: 'audit-trail', objectId: baselineId }, requiredAction: 'auditTrail' },
  ];
}

function buildBaselineSectionMenu(): MenuItemDef[] {
  return [
    { key: 'create-baseline', label: 'Create Baseline', action: { type: 'create-baseline' }, requiredAction: 'createBaseline' },
    { key: 'refresh', label: 'Refresh', action: { type: 'refresh' } },
  ];
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Build the context menu for any node key.
 * Fully permission-filtered: hidden items are removed, not just disabled.
 */
export function buildContextMenu(
  key: string,
  nodeData: Record<string, unknown> | undefined,
  onAction: (action: ExplorerMenuAction) => void,
  options?: {
    objectsById?: Map<string, { id: string; type: string; attributes: Record<string, unknown> }>;
    canEdit?: boolean;
    role?: RepositoryRole;
  },
): MenuProps {
  const role: RepositoryRole = options?.role ?? 'Owner';
  const nameForElement = (id: string): string => {
    const obj = options?.objectsById?.get(id);
    if (!obj) return id;
    const raw = (obj.attributes as any)?.name;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : id;
  };

  const kind = classifyNodeKey(key, nodeData);

  switch (kind) {
    case 'element': {
      const elementId = (nodeData?.elementId as string) ?? key.replace('element:', '');
      const elementType = (nodeData?.elementType as string) ?? 'Unknown';
      const elementName = nameForElement(elementId);
      return toAntdMenu(buildElementMenu(elementId, elementType, elementName), onAction, role);
    }

    case 'diagram': {
      const viewId = (nodeData?.viewId as string) ?? key.replace('view:', '');
      return toAntdMenu(buildDiagramMenu(viewId), onAction, role);
    }

    case 'baseline': {
      const baselineId = (nodeData?.baselineId as string) ?? key.replace('baseline:', '');
      return toAntdMenu(buildBaselineMenu(baselineId), onAction, role);
    }

    case 'roadmap': {
      const roadmapId = (nodeData?.roadmapId as string) ?? '';
      return toAntdMenu([
        { key: 'open', label: 'Open Roadmap', action: { type: 'open-roadmap', roadmapId } },
      ], onAction, role);
    }

    case 'plateau': {
      const plateauId = (nodeData?.plateauId as string) ?? key.replace('plateau:', '');
      return toAntdMenu([
        { key: 'open', label: 'Open Plateau', action: { type: 'open-plateau', plateauId } },
      ], onAction, role);
    }

    case 'catalog':
      return toAntdMenu([
        { key: 'open', label: 'Open Catalogue', action: { type: 'open-catalog', catalogKey: nodeData?.catalogKey as string } },
      ], onAction, role);

    case 'matrix':
      return toAntdMenu([
        { key: 'open', label: 'Open Matrix', action: { type: 'open-matrix', matrixKey: nodeData?.matrixKey as string } },
      ], onAction, role);

    case 'report':
      return toAntdMenu([
        { key: 'open', label: 'Open Report', action: { type: 'open-report', reportType: nodeData?.reportType as string } },
      ], onAction, role);

    case 'setting':
      return toAntdMenu([
        { key: 'open', label: 'Open', action: { type: 'open-setting', settingKey: nodeData?.settingKey as string } },
      ], onAction, role);

    case 'folder': {
      // Baselines section has special menu
      if (key === EXPLORER_KEYS.baselines || key === EXPLORER_KEYS.baselineSnapshots) {
        return toAntdMenu(buildBaselineSectionMenu(), onAction, role);
      }
      return toAntdMenu(buildFolderMenu(key), onAction, role);
    }

    default:
      return toAntdMenu([
        { key: 'refresh', label: 'Refresh', action: { type: 'refresh' } },
      ], onAction, role);
  }
}
