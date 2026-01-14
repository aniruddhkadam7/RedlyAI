export type AssuranceCheckMeta = {
  title: string;
  whyItMatters: string;
  howToFix: string;
};

/**
 * Explicit, reviewable catalog of governance/validation checks.
 *
 * This is intentionally data-first:
 * - No mutation
 * - No enforcement logic
 * - Used to attach explanations to findings (trust via transparency)
 */
export const ASSURANCE_CHECK_CATALOG: Readonly<Record<string, AssuranceCheckMeta>> = {
  // Repository validation
  CAPABILITY_MISSING_OWNER: {
    title: 'Capability missing ownership',
    whyItMatters: 'Without ownership, accountability and prioritization become unclear, which weakens governance and decision-making.',
    howToFix: 'Populate ownerRole, ownerName, and owningUnit for the Capability.',
  },
  APPLICATION_MISSING_LIFECYCLE: {
    title: 'Application missing lifecycle',
    whyItMatters: 'Lifecycle data is needed for risk management, roadmaps, and reliable impact analysis.',
    howToFix: 'Set lifecycleStatus and lifecycleStartDate for the Application (even if preliminary).',
  },
  TECHNOLOGY_PAST_SUPPORT_END_DATE: {
    title: 'Technology past support end date',
    whyItMatters: 'Out-of-support technology increases operational and security risk and can invalidate future-state plans.',
    howToFix: 'Update supportEndDate, migrate/upgrade the technology, or mark the element lifecycle accordingly.',
  },

  // Relationship validation
  APPLICATION_DEPENDS_ON_SELF: {
    title: 'Application depends on itself',
    whyItMatters: 'Self-dependencies distort dependency graphs and can break traversal/impact logic.',
    howToFix: 'Remove the relationship or correct its endpoints.',
  },
  PROCESS_MISSING_CAPABILITY_PARENT: {
    title: 'BusinessProcess missing Capability parent',
    whyItMatters: 'A process must be owned by a capability to support decomposition, navigation, and governance reporting.',
    howToFix: 'Set parentCapabilityId to a valid Capability and/or add the corresponding DECOMPOSES_TO relationship.',
  },
  APPLICATION_DEPENDENCY_MISSING_STRENGTH: {
    title: 'Application dependency missing strength',
    whyItMatters: 'Dependency strength improves impact analysis fidelity and helps prioritize mitigations.',
    howToFix: 'Set dependencyStrength (e.g., Hard | Soft) on application dependency relationships (e.g., INTEGRATES_WITH).',
  },
  PROGRAMME_IMPACTS_RETIRED_ELEMENT: {
    title: 'Programme impacts retired element',
    whyItMatters: 'Impacts on retired items are often stale and can mislead roadmap decisions.',
    howToFix: 'Confirm intent, update the target lifecycle, or retarget the programme impact.',
  },

  // Integrity audit
  RELATIONSHIP_DANGLING_REFERENCE: {
    title: 'Relationship references missing element',
    whyItMatters: 'Dangling references break graph integrity and can cause incomplete views/impact analysis.',
    howToFix: 'Fix sourceElementId/targetElementId or restore the missing element.',
  },
  PROCESS_MULTIPLE_CAPABILITY_PARENTS: {
    title: 'BusinessProcess has multiple Capability parents',
    whyItMatters: 'Multiple parents makes decomposition ambiguous and undermines consistent reporting.',
    howToFix: 'Consolidate to a single parent capability (or split into separate processes).',
  },
  APPLICATION_DEPENDENCY_CONFLICTING_STRENGTH: {
    title: 'Conflicting dependency strength values',
    whyItMatters: 'Conflicting metadata prevents consistent interpretation of the dependency for analysis and governance.',
    howToFix: 'Standardize dependencyStrength values for each source->target pair.',
  },

  // View governance
  VIEW_MISSING_DESCRIPTION: {
    title: 'View missing description',
    whyItMatters: 'Descriptions provide intent/context, enabling reuse and reducing misinterpretation.',
    howToFix: 'Add a concise description explaining what the view is for and how it should be used.',
  },
  VIEW_DEPTH_EXCEEDS_MAX: {
    title: 'View depth exceeds enterprise maximum',
    whyItMatters: 'Very deep views tend to be noisy and non-deterministic for decision-making.',
    howToFix: 'Reduce maxDepth (or narrow the scope via rootElementId and allowed types).',
  },
  VIEW_REFERENCES_RETIRED_ELEMENTS: {
    title: 'View references retired elements',
    whyItMatters: 'Retired elements can confuse stakeholders and reduce trust in the view’s accuracy.',
    howToFix: 'Update the view scope, or confirm retired elements are intentionally included.',
  },
} as const;

export function getAssuranceCheckMeta(checkId: string): AssuranceCheckMeta | null {
  const key = (checkId ?? '').trim();
  return ASSURANCE_CHECK_CATALOG[key] ?? null;
}
