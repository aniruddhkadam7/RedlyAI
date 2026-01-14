import type { BaseArchitectureElement } from '../repository/BaseArchitectureElement';
import type { BaseArchitectureRelationship } from '../repository/BaseArchitectureRelationship';

/**
 * Baseline = point-in-time snapshot of the entire repository (elements + relationships).
 * - Read-only after creation.
 * - Independent of any diagram/view layout.
 */
export type Baseline = {
  /** Stable baseline id (caller-supplied or generated). */
  readonly id: string;
  /** Human-friendly label, e.g., "Q1 2026 Current State". */
  name: string;
  description?: string;
  /** ISO-8601 timestamp when the baseline was created. */
  createdAt: string;
  /** Optional creator identity for audit. */
  createdBy?: string;
  /** Source revisions captured with this snapshot. */
  source: {
    elementsRevision: number;
    relationshipsRevision: number;
  };
  /** Full element set at capture time (includes lifecycle fields/properties). */
  elements: readonly BaseArchitectureElement[];
  /** Full relationship set at capture time. */
  relationships: readonly BaseArchitectureRelationship[];
};

export type BaselineCreateRequest = {
  /** Optional explicit id; if omitted, one is generated. */
  id?: string;
  /** Required display name. */
  name: string;
  description?: string;
  createdBy?: string;
  /** Optional override for createdAt; defaults to now if omitted. */
  createdAt?: string | Date;
};
