/**
 * Inline Connection Palette
 *
 * A non-modal popup that appears near the cursor/target when multiple
 * connection options exist. Shows direct relationships (green) and
 * indirect paths (blue) in a compact, keyboard-navigable list.
 *
 * Key requirements:
 *   - No modal dialogs
 *   - No toolbox dependency
 *   - Appears near cursor/target
 *   - Shows only valid relationships
 *   - Keyboard navigable (arrow keys + Enter)
 *   - Dismissible via Escape or click-outside
 */

import React from 'react';
import type { ConnectionResolution, DirectRelationship, IndirectPath } from './types';
import type { RelationshipType } from '@/pages/dependency-view/utils/eaMetaModel';
import { CONNECTION_FEEDBACK_COLORS } from './connectionVisualFeedback';

// ─── Types ───────────────────────────────────────────────────────────
export type ConnectionPaletteSelection =
  | { kind: 'direct'; type: RelationshipType }
  | { kind: 'indirect'; path: IndirectPath };

export type InlineConnectionPaletteProps = {
  resolution: ConnectionResolution;
  position: { x: number; y: number };
  onSelect: (selection: ConnectionPaletteSelection) => void;
  onDismiss: () => void;
  /** Optional: container ref for coordinate conversion */
  containerRef?: React.RefObject<HTMLDivElement>;
};

// ─── Styles (inline to avoid external CSS dependency) ────────────────
const PALETTE_STYLES = {
  container: {
    position: 'fixed' as const,
    transform: 'translate(-50%, -50%)',
    zIndex: 1600,
    background: '#ffffff',
    border: '1px solid rgba(0, 0, 0, 0.12)',
    borderRadius: 10,
    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.14), 0 3px 8px rgba(0, 0, 0, 0.08)',
    padding: 10,
    minWidth: 220,
    maxWidth: 320,
    maxHeight: 340,
    overflowY: 'auto' as const,
    display: 'grid' as const,
    gap: 4,
    pointerEvents: 'auto' as const,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: 'rgba(0, 0, 0, 0.55)',
    padding: '2px 4px',
    userSelect: 'none' as const,
  },
  sectionLabel: {
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
    color: 'rgba(0, 0, 0, 0.4)',
    padding: '6px 4px 2px',
    userSelect: 'none' as const,
  },
  directOption: {
    width: '100%',
    background: 'rgba(82, 196, 26, 0.06)',
    border: `1px solid rgba(82, 196, 26, 0.25)`,
    borderRadius: 6,
    padding: '7px 10px',
    fontSize: 12,
    textAlign: 'left' as const,
    cursor: 'pointer',
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 8,
    transition: 'background 120ms, border-color 120ms',
    outline: 'none',
  },
  directOptionHover: {
    background: 'rgba(82, 196, 26, 0.12)',
    borderColor: 'rgba(82, 196, 26, 0.45)',
  },
  indirectOption: {
    width: '100%',
    background: 'rgba(24, 144, 255, 0.06)',
    border: `1px solid rgba(24, 144, 255, 0.25)`,
    borderRadius: 6,
    padding: '7px 10px',
    fontSize: 12,
    textAlign: 'left' as const,
    cursor: 'pointer',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 3,
    transition: 'background 120ms, border-color 120ms',
    outline: 'none',
  },
  indirectOptionHover: {
    background: 'rgba(24, 144, 255, 0.12)',
    borderColor: 'rgba(24, 144, 255, 0.45)',
  },
  dot: (color: string) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }),
  pathChain: {
    fontSize: 10,
    color: 'rgba(0, 0, 0, 0.45)',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  focusRing: {
    outline: `2px solid ${CONNECTION_FEEDBACK_COLORS.directValid}`,
    outlineOffset: 2,
  },
};

// Dark theme overrides
const DARK_OVERRIDES = {
  container: {
    ...PALETTE_STYLES.container,
    background: '#2d2d2d',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.4)',
  },
  header: {
    ...PALETTE_STYLES.header,
    color: 'rgba(255, 255, 255, 0.55)',
  },
  sectionLabel: {
    ...PALETTE_STYLES.sectionLabel,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  directOption: {
    ...PALETTE_STYLES.directOption,
    background: 'rgba(82, 196, 26, 0.08)',
    border: '1px solid rgba(82, 196, 26, 0.3)',
    color: '#e0e0e0',
  },
  indirectOption: {
    ...PALETTE_STYLES.indirectOption,
    background: 'rgba(24, 144, 255, 0.08)',
    border: '1px solid rgba(24, 144, 255, 0.3)',
    color: '#e0e0e0',
  },
  pathChain: {
    ...PALETTE_STYLES.pathChain,
    color: 'rgba(255, 255, 255, 0.45)',
  },
};

// ─── Helper: format relationship label ──────────────────────────────
function formatLabel(type: RelationshipType): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatIndirectLabel(path: IndirectPath): string {
  return `via ${path.intermediateTypes.join(' → ')}`;
}

function formatIndirectChain(path: IndirectPath): string {
  return path.hops.map((h) => `${h.fromType} → ${h.toType}`).join(' → ');
}

// ─── Component ───────────────────────────────────────────────────────
export const InlineConnectionPalette: React.FC<InlineConnectionPaletteProps> = ({
  resolution,
  position,
  onSelect,
  onDismiss,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
  const s = isDark ? { ...PALETTE_STYLES, ...DARK_OVERRIDES } : PALETTE_STYLES;

  // Build flat list of all options for keyboard navigation.
  const options = React.useMemo(() => {
    const all: Array<{ kind: 'direct'; rel: DirectRelationship } | { kind: 'indirect'; path: IndirectPath }> = [];
    for (const rel of resolution.directRelationships) {
      all.push({ kind: 'direct', rel });
    }
    for (const path of resolution.indirectPaths) {
      all.push({ kind: 'indirect', path });
    }
    return all;
  }, [resolution]);

  // Keyboard navigation.
  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onDismiss(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIndex((i) => Math.min(i + 1, options.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIndex((i) => Math.max(i - 1, 0)); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const opt = options[focusIndex];
        if (!opt) return;
        if (opt.kind === 'direct') onSelect({ kind: 'direct', type: opt.rel.type });
        else onSelect({ kind: 'indirect', path: opt.path });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [focusIndex, onDismiss, onSelect, options]);

  // Click-outside dismiss.
  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [onDismiss]);

  // Auto-focus container.
  React.useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const hasDirect = resolution.directRelationships.length > 0;
  const hasIndirect = resolution.indirectPaths.length > 0;
  let optionIdx = -1;

  return (
    <div
      ref={containerRef}
      style={{ ...s.container, left: position.x, top: position.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      tabIndex={-1}
      role="listbox"
      aria-label="Connection options"
    >
      <div style={s.header}>
        Connect {resolution.sourceType} → {resolution.targetType}
      </div>

      {/* Direct relationships */}
      {hasDirect && hasIndirect && (
        <div style={s.sectionLabel}>Direct</div>
      )}
      {resolution.directRelationships.map((rel) => {
        optionIdx++;
        const idx = optionIdx;
        const isFocused = focusIndex === idx;
        const isHovered = hoveredIndex === idx;
        return (
          <button
            key={`direct-${rel.type}`}
            type="button"
            role="option"
            aria-selected={isFocused}
            style={{
              ...s.directOption,
              ...(isHovered || isFocused ? (s as typeof PALETTE_STYLES).directOptionHover : {}),
              ...(isFocused ? PALETTE_STYLES.focusRing : {}),
            }}
            onClick={() => onSelect({ kind: 'direct', type: rel.type })}
            onMouseEnter={() => setHoveredIndex(idx)}
            onMouseLeave={() => setHoveredIndex(null)}
            onFocus={() => setFocusIndex(idx)}
          >
            <span style={PALETTE_STYLES.dot(CONNECTION_FEEDBACK_COLORS.directValid)} />
            <span>{formatLabel(rel.type)}</span>
          </button>
        );
      })}

      {/* Indirect paths */}
      {hasIndirect && hasDirect && (
        <div style={s.sectionLabel}>Via intermediate</div>
      )}
      {hasIndirect && !hasDirect && (
        <div style={s.sectionLabel}>Indirect paths</div>
      )}
      {resolution.indirectPaths.map((path, pathIdx) => {
        optionIdx++;
        const idx = optionIdx;
        const isFocused = focusIndex === idx;
        const isHovered = hoveredIndex === idx;
        return (
          <button
            key={`indirect-${path.intermediateTypes.join('-')}-${path.hops.map(h => h.relationshipType).join('-')}`}
            type="button"
            role="option"
            aria-selected={isFocused}
            style={{
              ...s.indirectOption,
              ...(isHovered || isFocused ? (s as typeof PALETTE_STYLES).indirectOptionHover : {}),
              ...(isFocused ? PALETTE_STYLES.focusRing : {}),
            }}
            onClick={() => onSelect({ kind: 'indirect', path })}
            onMouseEnter={() => setHoveredIndex(idx)}
            onMouseLeave={() => setHoveredIndex(null)}
            onFocus={() => setFocusIndex(idx)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={PALETTE_STYLES.dot(CONNECTION_FEEDBACK_COLORS.indirectValid)} />
              <span>{formatIndirectLabel(path)}</span>
            </div>
            <div style={s.pathChain}>{formatIndirectChain(path)}</div>
          </button>
        );
      })}

      {/* No path — actionable suggestion */}
      {!hasDirect && !hasIndirect && resolution.noPathSuggestion && (
        <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', padding: '4px 4px 2px', lineHeight: 1.5 }}>
          {resolution.noPathSuggestion}
        </div>
      )}
    </div>
  );
};

InlineConnectionPalette.displayName = 'InlineConnectionPalette';
