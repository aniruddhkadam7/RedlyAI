/**
 * Connection Editor Panel
 *
 * Post-creation inline editor that allows:
 *   - Changing relationship type
 *   - Switching indirect path
 *   - Expanding/collapsing intermediate elements
 *
 * Opens when a user clicks on a created connection edge.
 */

import React from 'react';
import type { RelationshipType } from '@/pages/dependency-view/utils/eaMetaModel';
import type { ConnectionEditAction, CreatedConnection, IndirectPath } from './types';
import { CONNECTION_FEEDBACK_COLORS } from './connectionVisualFeedback';

// ─── Types ───────────────────────────────────────────────────────────
export type ConnectionEditorProps = {
  connection: CreatedConnection;
  /** All valid relationship types for this source→target pair. */
  validTypes: RelationshipType[];
  /** All valid indirect paths (for switching). */
  validIndirectPaths: IndirectPath[];
  position: { x: number; y: number };
  onAction: (action: ConnectionEditAction) => void;
  onDismiss: () => void;
};

// ─── Styles ──────────────────────────────────────────────────────────
const EDITOR_STYLES = {
  container: {
    position: 'fixed' as const,
    transform: 'translate(-50%, 8px)',
    zIndex: 1600,
    background: '#ffffff',
    border: '1px solid rgba(0, 0, 0, 0.12)',
    borderRadius: 10,
    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.14), 0 3px 8px rgba(0, 0, 0, 0.08)',
    padding: 10,
    minWidth: 200,
    maxWidth: 300,
    display: 'grid' as const,
    gap: 6,
    pointerEvents: 'auto' as const,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  sectionLabel: {
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
    color: 'rgba(0, 0, 0, 0.45)',
    padding: '4px 4px 0',
    userSelect: 'none' as const,
  },
  typeButton: (isActive: boolean) => ({
    width: '100%',
    background: isActive ? 'rgba(82, 196, 26, 0.12)' : 'rgba(0, 0, 0, 0.02)',
    border: isActive
      ? `1px solid ${CONNECTION_FEEDBACK_COLORS.directValid}`
      : '1px solid rgba(0, 0, 0, 0.08)',
    borderRadius: 5,
    padding: '6px 10px',
    fontSize: 12,
    textAlign: 'left' as const,
    cursor: 'pointer',
    fontWeight: isActive ? 600 : 400,
    transition: 'background 120ms, border-color 120ms',
    outline: 'none',
  }),
  expandButton: {
    width: '100%',
    background: 'rgba(24, 144, 255, 0.06)',
    border: `1px solid rgba(24, 144, 255, 0.25)`,
    borderRadius: 5,
    padding: '6px 10px',
    fontSize: 12,
    textAlign: 'left' as const,
    cursor: 'pointer',
    transition: 'background 120ms',
    outline: 'none',
  },
  derivedBadge: {
    display: 'inline-block',
    fontSize: 9,
    padding: '1px 5px',
    borderRadius: 3,
    background: 'rgba(24, 144, 255, 0.1)',
    color: CONNECTION_FEEDBACK_COLORS.indirectValid,
    marginLeft: 6,
    verticalAlign: 'middle',
    userSelect: 'none' as const,
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────
function formatLabel(type: RelationshipType): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Component ───────────────────────────────────────────────────────
export const ConnectionEditor: React.FC<ConnectionEditorProps> = ({
  connection,
  validTypes,
  validIndirectPaths,
  position,
  onAction,
  onDismiss,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Click-outside + Escape dismiss.
  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onDismiss]);

  return (
    <div
      ref={containerRef}
      style={{ ...EDITOR_STYLES.container, left: position.x, top: position.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Relationship type changer */}
      <div style={EDITOR_STYLES.sectionLabel}>Relationship type</div>
      {validTypes.map((type) => (
        <button
          key={type}
          type="button"
          style={EDITOR_STYLES.typeButton(type === connection.primaryType)}
          onClick={() => {
            if (type !== connection.primaryType) {
              onAction({ action: 'change-type', newType: type });
            }
          }}
        >
          {formatLabel(type)}
          {type === connection.primaryType && ' ✓'}
        </button>
      ))}

      {/* Expand/collapse for derived connections */}
      {connection.isDerived && (
        <>
          <div style={EDITOR_STYLES.sectionLabel}>
            Intermediates
            <span style={EDITOR_STYLES.derivedBadge}>derived</span>
          </div>
          <button
            type="button"
            style={EDITOR_STYLES.expandButton}
            onClick={() =>
              onAction(
                connection.collapsed
                  ? { action: 'expand-intermediates' }
                  : { action: 'collapse-intermediates' },
              )
            }
          >
            {connection.collapsed ? '⊕ Expand intermediates' : '⊖ Collapse to single edge'}
          </button>
        </>
      )}

      {/* Switch indirect path */}
      {validIndirectPaths.length > 1 && (
        <>
          <div style={EDITOR_STYLES.sectionLabel}>Alternative paths</div>
          {validIndirectPaths.slice(0, 5).map((path) => (
            <button
              key={`path-${path.intermediateTypes.join('-')}`}
              type="button"
              style={EDITOR_STYLES.expandButton}
              onClick={() => onAction({ action: 'switch-path', newPath: path })}
            >
              via {path.intermediateTypes.join(' → ')}
            </button>
          ))}
        </>
      )}
    </div>
  );
};

ConnectionEditor.displayName = 'ConnectionEditor';
