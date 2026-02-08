/**
 * Visual Feedback for Connection Resolution
 *
 * Determines the visual feedback (outline color, CSS class, tooltip) to show
 * on target nodes during drag based on connection resolution results.
 *
 * Rules:
 *   - Green outline: direct valid relationship exists
 *   - Blue outline: indirect valid relationship exists (through intermediates)
 *   - Neutral (no color): no valid path exists
 *   - NEVER show red on hover — this is not a validator
 */

import type { ConnectionResolution, ConnectionVisualFeedback, ConnectionFeedbackKind } from './types';

// ─── CSS Class Names (applied to Cytoscape nodes) ───────────────────
export const CONNECTION_FEEDBACK_CLASSES = {
  directValid: 'connection-direct-valid',
  indirectValid: 'connection-indirect-valid',
  neutral: 'connection-neutral',
  // Legacy classes to remove when our system takes over
  legacyValid: 'validTargetCandidate',
  legacyInvalid: 'invalidTarget',
} as const;

// ─── Colors ──────────────────────────────────────────────────────────
export const CONNECTION_FEEDBACK_COLORS = {
  directValid: '#52c41a',   // Green — direct path available
  indirectValid: '#1890ff', // Blue — indirect path available
  neutral: 'transparent',   // No outline — no path, but no error either
} as const;

// ─── Main Feedback Function ──────────────────────────────────────────
/**
 * Determine visual feedback for a target node based on connection resolution.
 */
export function getConnectionFeedback(resolution: ConnectionResolution): ConnectionVisualFeedback {
  if (resolution.directRelationships.length > 0) {
    const count = resolution.directRelationships.length;
    return {
      kind: 'direct-valid' as ConnectionFeedbackKind,
      cssClass: CONNECTION_FEEDBACK_CLASSES.directValid,
      outlineColor: CONNECTION_FEEDBACK_COLORS.directValid,
      tooltip: count === 1
        ? `Connect: ${resolution.directRelationships[0].label}`
        : `${count} connection types available`,
    };
  }

  if (resolution.indirectPaths.length > 0) {
    const count = resolution.indirectPaths.length;
    const bestPath = resolution.indirectPaths[0];
    const via = bestPath.intermediateTypes.join(', ');
    return {
      kind: 'indirect-valid' as ConnectionFeedbackKind,
      cssClass: CONNECTION_FEEDBACK_CLASSES.indirectValid,
      outlineColor: CONNECTION_FEEDBACK_COLORS.indirectValid,
      tooltip: count === 1
        ? `Connect via ${via}`
        : `${count} indirect paths available (via ${via})`,
    };
  }

  return {
    kind: 'neutral' as ConnectionFeedbackKind,
    cssClass: CONNECTION_FEEDBACK_CLASSES.neutral,
    outlineColor: CONNECTION_FEEDBACK_COLORS.neutral,
    tooltip: '',
  };
}

// ─── Cytoscape Style Definitions ─────────────────────────────────────
/**
 * Returns Cytoscape stylesheet entries for connection feedback classes.
 * These should be merged into the Cytoscape style array.
 */
export function getConnectionFeedbackStyles(): Array<{ selector: string; style: Record<string, unknown> }> {
  return [
    {
      selector: `.${CONNECTION_FEEDBACK_CLASSES.directValid}`,
      style: {
        'border-width': 3,
        'border-color': CONNECTION_FEEDBACK_COLORS.directValid,
        'border-opacity': 0.9,
        'overlay-color': CONNECTION_FEEDBACK_COLORS.directValid,
        'overlay-opacity': 0.08,
        'overlay-padding': 6,
        'transition-property': 'border-color, border-width, overlay-opacity',
        'transition-duration': '150ms',
      },
    },
    {
      selector: `.${CONNECTION_FEEDBACK_CLASSES.indirectValid}`,
      style: {
        'border-width': 3,
        'border-color': CONNECTION_FEEDBACK_COLORS.indirectValid,
        'border-opacity': 0.9,
        'overlay-color': CONNECTION_FEEDBACK_COLORS.indirectValid,
        'overlay-opacity': 0.08,
        'overlay-padding': 6,
        'transition-property': 'border-color, border-width, overlay-opacity',
        'transition-duration': '150ms',
      },
    },
    {
      selector: `.${CONNECTION_FEEDBACK_CLASSES.neutral}`,
      style: {
        // No visual change — neutral means "we won't connect here" but no error.
        'border-width': 0,
        'overlay-opacity': 0,
      },
    },
    // Derived (auto-inserted) elements get a subtle dashed border.
    {
      selector: 'node[?derived]',
      style: {
        'border-style': 'dashed',
        'border-width': 2,
        'border-color': '#bbb',
        'border-opacity': 0.6,
      },
    },
    // Derived edges (compound relationship segments) get a dashed line.
    {
      selector: 'edge[?derived]',
      style: {
        'line-style': 'dashed',
        'line-dash-pattern': [6, 3],
        'opacity': 0.7,
      },
    },
    // Collapsed compound edges get a double-line effect.
    {
      selector: 'edge[?compoundCollapsed]',
      style: {
        'line-style': 'solid',
        'width': 3,
        'line-color': CONNECTION_FEEDBACK_COLORS.indirectValid,
        'target-arrow-color': CONNECTION_FEEDBACK_COLORS.indirectValid,
      },
    },
  ];
}

/**
 * Remove all connection feedback classes from a Cytoscape node.
 */
export function clearConnectionFeedbackClasses(node: { removeClass: (cls: string) => void }): void {
  node.removeClass(CONNECTION_FEEDBACK_CLASSES.directValid);
  node.removeClass(CONNECTION_FEEDBACK_CLASSES.indirectValid);
  node.removeClass(CONNECTION_FEEDBACK_CLASSES.neutral);
  // Also clear legacy classes
  node.removeClass(CONNECTION_FEEDBACK_CLASSES.legacyValid);
  node.removeClass(CONNECTION_FEEDBACK_CLASSES.legacyInvalid);
}
