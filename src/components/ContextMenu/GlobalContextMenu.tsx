/**
 * Global Context Menu — Rendered component
 *
 * Spec §1:
 *   - Prevent default browser context menu
 *   - Capture cursor position (x, y)
 *   - Render menu at cursor position
 *   - Auto-adjust if near screen edge
 *
 * Spec §7 Behavioral Rules:
 *   - Menu closes when clicking outside
 *   - ESC closes menu
 *   - Keyboard shortcuts must trigger same actions
 *   - Menu must support nested submenus
 *   - Menu must support disabled state (grayed out)
 *
 * Spec §9 Positioning rules:
 *   - Shift left/up if overflowing viewport
 *
 * Spec §10 Event flow:
 *   ON menu_action_click:
 *     1. Validate permission
 *     2. Execute action handler
 *     3. Begin transaction
 *     4. Update repository
 *     5. Write audit log
 *     6. Emit event
 *     7. Close menu
 *
 * This component is mounted ONCE at the app root level.
 * It listens to the ContextMenuProvider state and renders at the
 * correct position when triggered.
 */

import React from 'react';
import { createPortal } from 'react-dom';

import type { MenuItem } from './contextMenuEngine';
import { adjustMenuPosition } from './contextMenuEngine';
import { useContextMenu } from './ContextMenuProvider';

// ---------------------------------------------------------------------------
// Icons — lightweight lookup from string name → Ant Design icon
// We import the small set referenced by the registry.
// ---------------------------------------------------------------------------
import {
  ApiOutlined,
  AppstoreOutlined,
  ArrowRightOutlined,
  AuditOutlined,
  CalculatorOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  ClusterOutlined,
  CopyOutlined,
  DeleteOutlined,
  DisconnectOutlined,
  DragOutlined,
  EditOutlined,
  ExportOutlined,
  FileAddOutlined,
  FileImageOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  ImportOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  MinusSquareOutlined,
  PartitionOutlined,
  PlusOutlined,
  PlusSquareOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  SnippetsOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  // SubnodeOutlined may not exist in @ant-design/icons v6 — fall back
  StopOutlined,
  SwapOutlined,
  UndoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';

const ICON_MAP: Record<string, React.FC<{ style?: React.CSSProperties }>> = {
  ApiOutlined,
  AppstoreOutlined,
  ArrowRightOutlined,
  AuditOutlined,
  CalculatorOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  ClusterOutlined,
  CopyOutlined,
  DeleteOutlined,
  DisconnectOutlined,
  DragOutlined,
  EditOutlined,
  ExportOutlined,
  FileAddOutlined,
  FileImageOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  ImportOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  MinusSquareOutlined,
  PartitionOutlined,
  PlusOutlined,
  PlusSquareOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  SnippetsOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  StopOutlined,
  SwapOutlined,
  UndoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
};

function resolveIcon(name?: string): React.ReactNode {
  if (!name) return null;
  const Comp = ICON_MAP[name];
  if (!Comp) return null;
  return <Comp style={{ fontSize: 14 }} />;
}

// ---------------------------------------------------------------------------
// Styles (inline to avoid external .less dependency)
// ---------------------------------------------------------------------------

const MENU_STYLES: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9998,
  },
  menu: {
    position: 'fixed',
    zIndex: 9999,
    minWidth: 200,
    maxWidth: 320,
    backgroundColor: '#fff',
    borderRadius: 8,
    boxShadow: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
    padding: '4px 0',
    userSelect: 'none',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 13,
    lineHeight: '22px',
    outline: 'none',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 16px',
    cursor: 'pointer',
    color: 'rgba(0,0,0,0.88)',
    transition: 'background-color 0.15s',
    whiteSpace: 'nowrap' as const,
  },
  itemHover: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  itemDisabled: {
    cursor: 'not-allowed',
    color: 'rgba(0,0,0,0.25)',
  },
  itemDanger: {
    color: '#ff4d4f',
  },
  itemDangerHover: {
    backgroundColor: '#fff2f0',
  },
  shortcut: {
    marginLeft: 'auto',
    paddingLeft: 24,
    fontSize: 11,
    color: 'rgba(0,0,0,0.35)',
  },
  divider: {
    height: 1,
    margin: '4px 12px',
    backgroundColor: 'rgba(5, 5, 5, 0.06)',
  },
  submenuArrow: {
    marginLeft: 'auto',
    paddingLeft: 8,
    fontSize: 10,
    color: 'rgba(0,0,0,0.35)',
  },
  submenu: {
    position: 'absolute' as const,
    top: -4,
    left: '100%',
    minWidth: 160,
    backgroundColor: '#fff',
    borderRadius: 8,
    boxShadow: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
    padding: '4px 0',
  },
};

// ---------------------------------------------------------------------------
// MenuItemRow
// ---------------------------------------------------------------------------

const MenuItemRow: React.FC<{
  item: MenuItem;
  onAction: (key: string) => void;
}> = ({ item, onAction }) => {
  const [hovered, setHovered] = React.useState(false);
  const [submenuOpen, setSubmenuOpen] = React.useState(false);
  const submenuTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  if (item.divider) {
    return <div style={MENU_STYLES.divider} />;
  }

  const hasChildren = item.children && item.children.length > 0;
  const isDanger = item.danger && !item.disabled;
  const baseStyle = {
    ...MENU_STYLES.item,
    ...(item.disabled ? MENU_STYLES.itemDisabled : {}),
    ...(hovered && !item.disabled ? (isDanger ? MENU_STYLES.itemDangerHover : MENU_STYLES.itemHover) : {}),
    ...(isDanger ? MENU_STYLES.itemDanger : {}),
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.disabled) return;
    if (hasChildren) return; // submenu opens on hover
    onAction(item.key);
  };

  const handleMouseEnter = () => {
    setHovered(true);
    if (hasChildren) {
      if (submenuTimerRef.current) clearTimeout(submenuTimerRef.current);
      setSubmenuOpen(true);
    }
  };

  const handleMouseLeave = () => {
    setHovered(false);
    if (hasChildren) {
      submenuTimerRef.current = setTimeout(() => setSubmenuOpen(false), 150);
    }
  };

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        role="menuitem"
        aria-disabled={item.disabled}
        tabIndex={item.disabled ? -1 : 0}
        style={baseStyle}
        onClick={handleClick}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') handleClick(e as any);
        }}
      >
        {resolveIcon(item.icon)}
        <span>{item.label}</span>
        {item.shortcut && <span style={MENU_STYLES.shortcut}>{item.shortcut}</span>}
        {hasChildren && <span style={MENU_STYLES.submenuArrow}>▸</span>}
      </div>
      {hasChildren && submenuOpen && (
        <div style={MENU_STYLES.submenu}>
          {item.children!.map(child => (
            <MenuItemRow key={child.key} item={child} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// GlobalContextMenu Component
// ---------------------------------------------------------------------------

const GlobalContextMenu: React.FC = () => {
  const { state, close, handleAction } = useContextMenu();
  const menuRef = React.useRef<HTMLDivElement>(null);

  // §7 — Close on ESC
  React.useEffect(() => {
    if (!state) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [state, close]);

  // §9 — Adjust position after render (measure actual menu size)
  const [adjustedPos, setAdjustedPos] = React.useState<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    if (!state) { setAdjustedPos(null); return; }
    // Initial position from engine
    const pos = adjustMenuPosition({ x: state.position.x, y: state.position.y });
    setAdjustedPos(pos);

    // Re-adjust after first paint with actual dimensions
    requestAnimationFrame(() => {
      if (!menuRef.current) return;
      const rect = menuRef.current.getBoundingClientRect();
      const refined = adjustMenuPosition(
        { x: state.position.x, y: state.position.y },
        rect.width,
        rect.height,
      );
      setAdjustedPos(refined);
    });
  }, [state]);

  if (!state || !state.items.length) return null;

  const pos = adjustedPos ?? { x: state.position.x, y: state.position.y };

  const onAction = (key: string) => {
    // §10 Event flow — close menu, then execute
    close();
    handleAction(key);
  };

  const overlayContent = (
    <>
      {/* Transparent overlay to catch outside clicks  —  §7 */}
      <div
        style={MENU_STYLES.overlay}
        onClick={close}
        onContextMenu={e => { e.preventDefault(); close(); }}
      />
      {/* Menu */}
      <div
        ref={menuRef}
        role="menu"
        tabIndex={-1}
        style={{
          ...MENU_STYLES.menu,
          left: pos.x,
          top: pos.y,
        }}
        onContextMenu={e => e.preventDefault()}
      >
        {state.items.map((item: MenuItem) => (
          <MenuItemRow key={item.key} item={item} onAction={onAction} />
        ))}
      </div>
    </>
  );

  // Render via portal at document.body so it is above everything
  return createPortal(overlayContent, document.body);
};

export default GlobalContextMenu;
