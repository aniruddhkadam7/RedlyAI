import type { BaseArchitectureElement } from './BaseArchitectureElement';

/**
 * Project.
 *
 * Core EA principle:
 * - Projects implement change in systems.
 */
export type Project = BaseArchitectureElement & {
  elementType: 'Project';
  programmeId: string | null;
};
