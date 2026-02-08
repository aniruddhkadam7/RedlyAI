/**
 * Connection Resolution Module — Public API
 *
 * User-first EA connection resolution system that replaces rule-first validation.
 * Allows dragging any element onto any other element and resolves the best
 * connection path automatically.
 */

// ─── Core Engine ─────────────────────────────────────────────────────
export {
  resolveConnection,
  resolveConnectionsForSource,
  findDirectRelationships,
  findIndirectPaths,
} from './connectionResolutionEngine';

// ─── Types ───────────────────────────────────────────────────────────
export type {
  DirectRelationship,
  IndirectHop,
  IndirectPath,
  ConnectionResolution,
  ConnectionResolutionKind,
  ConnectionVisualFeedback,
  ConnectionFeedbackKind,
  CreatedConnection,
  ConnectionEditAction,
} from './types';

// ─── Visual Feedback ─────────────────────────────────────────────────
export {
  getConnectionFeedback,
  getConnectionFeedbackStyles,
  clearConnectionFeedbackClasses,
  CONNECTION_FEEDBACK_CLASSES,
  CONNECTION_FEEDBACK_COLORS,
} from './connectionVisualFeedback';

// ─── React Components ───────────────────────────────────────────────
export { InlineConnectionPalette } from './InlineConnectionPalette';
export type { ConnectionPaletteSelection, InlineConnectionPaletteProps } from './InlineConnectionPalette';

export { ConnectionEditor } from './ConnectionEditor';
export type { ConnectionEditorProps } from './ConnectionEditor';

// ─── React Hook ──────────────────────────────────────────────────────
export { useConnectionResolution } from './useConnectionResolution';
export type { UseConnectionResolutionOptions, ConnectionResolutionState } from './useConnectionResolution';
