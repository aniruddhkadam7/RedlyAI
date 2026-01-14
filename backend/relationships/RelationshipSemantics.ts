export type RelationshipEndpointRule = {
  from: readonly string[];
  to: readonly string[];
  /** Optional strict endpoint rules (pair-specific). When present, endpoints must match one of these pairs. */
  pairs?: readonly { from: string; to: string }[];
};

/**
 * Canonical relationship endpoint semantics.
 *
 * This is shared by:
 * - Relationship storage validation (safe writes)
 * - View definition validation (safe projections)
 * - View template instantiation (deterministic defaults)
 */
export const RELATIONSHIP_ENDPOINT_RULES: Readonly<Record<string, RelationshipEndpointRule>> = {
  // Capability decomposition (business structure)
  DECOMPOSES_TO: { from: ['Capability'], to: ['Capability'] },
  COMPOSED_OF: {
    from: ['CapabilityCategory', 'Capability', 'SubCapability'],
    to: ['CapabilityCategory', 'Capability', 'SubCapability'],
    pairs: [
      { from: 'CapabilityCategory', to: 'Capability' },
      { from: 'Capability', to: 'SubCapability' },
      { from: 'Capability', to: 'Capability' },
    ],
  },

  // Business-process execution (legacy support)
  REALIZES: { from: ['BusinessProcess'], to: ['Application'] },

  // Enterprise / organization
  OWNS: { from: ['Enterprise'], to: ['Enterprise', 'Capability', 'Application', 'Programme'] },
  HAS: { from: ['Enterprise'], to: ['Department'] },

  // Business services
  REALIZED_BY: { from: ['Capability'], to: ['BusinessService'] },

  // Application services
  PROVIDES: { from: ['Application'], to: ['ApplicationService'] },
  SUPPORTS: { from: ['ApplicationService'], to: ['BusinessService'] },

  // Application service dependencies
  CONSUMES: { from: ['ApplicationService'], to: ['ApplicationService'] },

  // Cross-layer
  SUPPORTED_BY: {
    from: ['Capability', 'SubCapability', 'BusinessService'],
    to: ['Application', 'ApplicationService'],
    pairs: [
      { from: 'Capability', to: 'Application' },
      { from: 'SubCapability', to: 'Application' },
      { from: 'BusinessService', to: 'ApplicationService' },
    ],
  },

  // Application dependency / impact analysis
  INTEGRATES_WITH: { from: ['Application'], to: ['Application'] },
  DEPENDS_ON: { from: ['ApplicationService'], to: ['ApplicationService'] },

  // Application-to-infrastructure traceability
  HOSTED_ON: { from: ['Application'], to: ['Technology'] },

  // Strategy-to-execution linkage
  IMPACTS: { from: ['Programme'], to: ['Capability'] },
  IMPLEMENTS: { from: ['Project'], to: ['Application'] },

  // Strategy (legacy)
  DELIVERS: { from: ['Programme'], to: ['Capability', 'Application', 'Technology'] },
} as const;

export function getRelationshipEndpointRule(type: string): RelationshipEndpointRule | null {
  const key = (type ?? '').trim();
  return RELATIONSHIP_ENDPOINT_RULES[key] ?? null;
}

export function isKnownRelationshipType(type: string): boolean {
  return Boolean(getRelationshipEndpointRule(type));
}
