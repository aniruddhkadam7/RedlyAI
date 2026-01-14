import type { BaseArchitectureElement } from './BaseArchitectureElement';

/**
 * Enterprise / legal entity / business unit.
 *
 * Notes:
 * - Supports hierarchical ownership (group → subsidiary → unit).
 * - parentEnterpriseId allows direct parent reference (preferred for property panel).
 * - Ownership relationships (OWNS) can also express hierarchy in the graph model.
 */
export type Enterprise = BaseArchitectureElement & {
  elementType: 'Enterprise';
  /**
   * Optional parent enterprise ID for hierarchical grouping.
   * Null means this is a root enterprise (e.g., "Tata Group").
   * When set, references another Enterprise (e.g., "Tata Motors" owned by "Tata Group").
   */
  parentEnterpriseId: Enterprise['id'] | null;
};
