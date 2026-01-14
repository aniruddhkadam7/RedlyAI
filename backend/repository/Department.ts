import type { BaseArchitectureElement } from './BaseArchitectureElement';

/**
 * Organizational unit.
 *
 * Constraint (by governance):
 * - Departments cannot exist without an owning Enterprise.
 */
export type Department = BaseArchitectureElement & {
  elementType: 'Department';
  enterpriseId: string | null;
};
