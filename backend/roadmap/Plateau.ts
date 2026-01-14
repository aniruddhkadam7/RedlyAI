/**
 * Plateau = named architecture state at a point in time.
 * - References a frozen snapshot (often a Baseline), never stores live repository copies.
 * - Ordered in time via occursAt.
 */
export type PlateauStateRef =
  | { kind: 'baseline'; baselineId: string; baselineRevision?: number }
  | { kind: 'external'; label: string; source?: string };

export type Plateau = {
  /** Stable plateau id (caller-supplied or generated). */
  readonly id: string;
  /** Human-readable plateau name, e.g., "2027 Target State". */
  name: string;
  description?: string;
  /** ISO-8601 point in time for ordering and intent. */
  occursAt: string;
  /** Read-only reference to the architecture state represented by this plateau. */
  stateRef: PlateauStateRef;
  /** Audit fields. */
  createdAt: string;
  createdBy?: string;
};

export type PlateauCreateRequest = {
  id?: string;
  name: string;
  description?: string;
  occursAt: string | Date;
  stateRef: PlateauStateRef;
  createdBy?: string;
};
