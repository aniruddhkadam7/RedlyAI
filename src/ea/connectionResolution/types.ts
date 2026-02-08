/**
 * Connection Resolution Types
 *
 * Type definitions for the user-first EA connection resolution system.
 * This system replaces rule-first validation with an intuitive resolution pipeline:
 *   1) Try direct ArchiMate relationships
 *   2) Infer indirect paths (max depth 2)
 *   3) Prefer canonical EA paths (Capability → Function → Service)
 *   4) Auto-create when unambiguous
 *   5) Show inline chooser when multiple paths exist
 */

import type { ObjectType, RelationshipType } from '@/pages/dependency-view/utils/eaMetaModel';

// ─── Direct Relationship ─────────────────────────────────────────────
/** A direct, single-hop relationship between source and target. */
export type DirectRelationship = {
  kind: 'direct';
  type: RelationshipType;
  fromType: ObjectType;
  toType: ObjectType;
  label: string;
  /** Canonical EA path (higher = more preferred: Capability→Service path wins). */
  canonicalScore: number;
};

// ─── Indirect Relationship ───────────────────────────────────────────
/** One segment (hop) in an indirect relationship path. */
export type IndirectHop = {
  relationshipType: RelationshipType;
  fromType: ObjectType;
  toType: ObjectType;
  /** The intermediate element that must be created to bridge this hop. */
  intermediateElementType?: ObjectType;
};

/** A multi-hop indirect path connecting source to target through intermediates. */
export type IndirectPath = {
  kind: 'indirect';
  hops: IndirectHop[];
  /** Human-readable description, e.g. "Capability → BusinessProcess → Application" */
  label: string;
  /** Types of intermediate elements that will be auto-inserted. */
  intermediateTypes: ObjectType[];
  /** Total hops (1 = direct alias; 2 = one intermediate). */
  depth: number;
  /** Preference score — canonical EA patterns rank highest. */
  canonicalScore: number;
};

// ─── Resolution Result ───────────────────────────────────────────────
export type ConnectionResolutionKind = 'auto-create' | 'choose-direct' | 'choose-any' | 'no-path';

export type ConnectionResolution = {
  sourceId: string;
  targetId: string;
  sourceType: ObjectType;
  targetType: ObjectType;

  /** All direct relationship types valid for this pair. */
  directRelationships: DirectRelationship[];

  /** All indirect paths (max depth 2) for this pair. */
  indirectPaths: IndirectPath[];

  /** Resolution recommendation. */
  recommendation: ConnectionResolutionKind;

  /**
   * The single best option when recommendation = 'auto-create'.
   * Either a direct relationship or the top-ranked indirect path.
   */
  autoCreateChoice?: DirectRelationship | IndirectPath;

  /** True if any direct or indirect path exists. */
  hasAnyPath: boolean;

  /**
   * Actionable suggestion when no path exists.
   * Not a rule — a helpful hint like "Consider adding an Application between these".
   */
  noPathSuggestion?: string;
};

// ─── Visual Feedback ─────────────────────────────────────────────────
export type ConnectionFeedbackKind = 'direct-valid' | 'indirect-valid' | 'neutral';

export type ConnectionVisualFeedback = {
  kind: ConnectionFeedbackKind;
  /** CSS class to apply to the target node. */
  cssClass: string;
  /** Outline color for the target node. */
  outlineColor: string;
  /** Short tooltip text. */
  tooltip: string;
};

// ─── Created Connection ──────────────────────────────────────────────
/** Represents a connection after it has been committed (direct or indirect). */
export type CreatedConnection = {
  /** The primary edge ID (visible to user). */
  primaryEdgeId: string;
  /** The relationship type of the primary edge. */
  primaryType: RelationshipType;
  /** Source element ID. */
  sourceId: string;
  /** Target element ID. */
  targetId: string;
  /** Whether this connection was created via indirect path resolution. */
  isDerived: boolean;
  /** IDs of intermediate elements auto-inserted (empty for direct). */
  intermediateElementIds: string[];
  /** IDs of intermediate relationship edges (empty for direct). */
  intermediateEdgeIds: string[];
  /** Whether intermediates are currently collapsed into a single visual edge. */
  collapsed: boolean;
};

// ─── Post-Creation Edit ──────────────────────────────────────────────
export type ConnectionEditAction =
  | { action: 'change-type'; newType: RelationshipType }
  | { action: 'switch-path'; newPath: IndirectPath }
  | { action: 'expand-intermediates' }
  | { action: 'collapse-intermediates' };
