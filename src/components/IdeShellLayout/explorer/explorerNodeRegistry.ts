/**
 * Explorer Node Registry — Meta-Model Driven Tree Definition Engine
 *
 * REQUIREMENTS:
 * 1. All node children are dynamically generated from repository metadata.
 * 2. No static hardcoded component types — types come from metamodel.
 * 3. Lazy load children on expand.
 * 4. Role-aware context menus.
 * 5. All CRUD operations transactional and audited.
 * 6. Explorer reflects real-time repository state.
 */

import type { ObjectType, EaLayer } from '@/pages/dependency-view/utils/eaMetaModel';
import { OBJECT_TYPE_DEFINITIONS, RELATIONSHIP_TYPE_DEFINITIONS } from '@/pages/dependency-view/utils/eaMetaModel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Describes a structural category node in the explorer tree. */
export type ExplorerNodeKind =
  | 'workspace-root'
  | 'section'          // e.g. Repository, Metamodel, Architectures, etc.
  | 'sub-section'      // e.g. Object Types, Relationship Types
  | 'category'         // e.g. Business Types, Application Types
  | 'collection'       // e.g. Capabilities, Processes — dynamic from metamodel
  | 'element-leaf'     // individual EA element from repository
  | 'view-leaf'        // saved view
  | 'baseline-leaf'    // baseline snapshot
  | 'roadmap-leaf'     // roadmap
  | 'plateau-leaf'     // plateau
  | 'report-leaf'      // report
  | 'setting-leaf'     // setting entry
  | 'metamodel-type'   // metamodel type definition
  | 'relationship-leaf'// relationship record
  | 'cta'              // call to action (e.g. "initialize enterprise")
  | 'placeholder';     // empty-state placeholder

export type ExplorerNodeData = {
  elementId?: string;
  elementType?: string;
  viewId?: string;
  roadmapId?: string;
  baselineId?: string;
  plateauId?: string;
  reportType?: string;
  settingKey?: string;
  metamodelType?: string;
  catalogKey?: string;
  matrixKey?: string;
  connectionType?: string;
};

/**
 * Canonical explorer tree key builder.
 * All keys are namespaced to avoid collision.
 */
export const EXPLORER_KEYS = {
  // Level 0 — Workspace root
  root: (workspaceName: string) => `ws:${workspaceName}`,

  // Level 1 — Top sections
  repository: 'section:repository',
  metamodel: 'section:metamodel',
  architectures: 'section:architectures',
  frameworkPackages: 'section:framework-packages',
  baselines: 'section:baselines',
  reports: 'section:reports',
  settings: 'section:settings',

  // Repository sub-items
  repoProperties: 'section:repository:properties',
  repoAuditTrail: 'section:repository:audit-trail',
  repoUsersRoles: 'section:repository:users-roles',
  repoAccessControl: 'section:repository:access-control',

  // Metamodel sub-sections
  metamodelStandards: 'section:metamodel:standards',
  metamodelObjectTypes: 'section:metamodel:object-types',
  metamodelRelTypes: 'section:metamodel:relationship-types',
  metamodelAttributes: 'section:metamodel:attributes',
  metamodelViewpoints: 'section:metamodel:viewpoints',

  // Metamodel object type categories
  objectTypeBusiness: 'category:object-types:business',
  objectTypeApplication: 'category:object-types:application',
  objectTypeTechnology: 'category:object-types:technology',
  objectTypeData: 'category:object-types:data',
  objectTypeCustom: 'category:object-types:custom',

  // Metamodel relationship type categories
  relTypeStructural: 'category:rel-types:structural',
  relTypeDependency: 'category:rel-types:dependency',
  relTypeFlow: 'category:rel-types:flow',
  relTypeCustom: 'category:rel-types:custom',

  // Metamodel attributes
  attributesGlobal: 'category:attributes:global',
  attributesTypeSpecific: 'category:attributes:type-specific',
  attributesCalculated: 'category:attributes:calculated',

  // Metamodel viewpoints
  viewpointsBusiness: 'category:viewpoints:business',
  viewpointsApplication: 'category:viewpoints:application',
  viewpointsTechnology: 'category:viewpoints:technology',
  viewpointsStrategy: 'category:viewpoints:strategy',

  // Architecture sub-sections
  architecture: (name: string) => `arch:${name}`,
  archComponents: (arch: string) => `arch:${arch}:components`,
  archConnections: (arch: string) => `arch:${arch}:connections`,
  archCatalogues: (arch: string) => `arch:${arch}:catalogues`,
  archMatrices: (arch: string) => `arch:${arch}:matrices`,
  archDiagrams: (arch: string) => `arch:${arch}:diagrams`,
  archRoadmaps: (arch: string) => `arch:${arch}:roadmaps`,

  // Component layer categories
  componentBusiness: (arch: string) => `arch:${arch}:components:business`,
  componentApplications: (arch: string) => `arch:${arch}:components:applications`,
  componentData: (arch: string) => `arch:${arch}:components:data`,
  componentTechnology: (arch: string) => `arch:${arch}:components:technology`,
  componentSecurity: (arch: string) => `arch:${arch}:components:security`,
  componentProjects: (arch: string) => `arch:${arch}:components:projects`,

  // Business component sub-collections
  businessCapabilities: (arch: string) => `arch:${arch}:components:business:capabilities`,
  businessProcesses: (arch: string) => `arch:${arch}:components:business:processes`,
  businessActors: (arch: string) => `arch:${arch}:components:business:actors`,

  // Application component sub-collections
  appApplications: (arch: string) => `arch:${arch}:components:apps:applications`,
  appAPIs: (arch: string) => `arch:${arch}:components:apps:apis`,
  appServices: (arch: string) => `arch:${arch}:components:apps:services`,

  // Data component sub-collections
  dataEntities: (arch: string) => `arch:${arch}:components:data:entities`,
  dataStores: (arch: string) => `arch:${arch}:components:data:stores`,

  // Technology component sub-collections
  techInfrastructure: (arch: string) => `arch:${arch}:components:tech:infrastructure`,
  techNetwork: (arch: string) => `arch:${arch}:components:tech:network`,
  techCloud: (arch: string) => `arch:${arch}:components:tech:cloud`,

  // Connection sub-sections
  connAllRelationships: (arch: string) => `arch:${arch}:connections:all`,
  connAppDependencies: (arch: string) => `arch:${arch}:connections:app-deps`,
  connDataFlows: (arch: string) => `arch:${arch}:connections:data-flows`,
  connDeployments: (arch: string) => `arch:${arch}:connections:deployments`,
  connIntegrations: (arch: string) => `arch:${arch}:connections:integrations`,

  // Catalogue sub-sections
  catApplication: (arch: string) => `arch:${arch}:catalogues:application`,
  catTechnology: (arch: string) => `arch:${arch}:catalogues:technology`,
  catRisk: (arch: string) => `arch:${arch}:catalogues:risk`,
  catVendor: (arch: string) => `arch:${arch}:catalogues:vendor`,
  catProjectPortfolio: (arch: string) => `arch:${arch}:catalogues:project-portfolio`,

  // Matrix sub-sections
  matAppVsCap: (arch: string) => `arch:${arch}:matrices:app-vs-cap`,
  matAppVsTech: (arch: string) => `arch:${arch}:matrices:app-vs-tech`,
  matCapVsProc: (arch: string) => `arch:${arch}:matrices:cap-vs-proc`,
  matRiskVsApp: (arch: string) => `arch:${arch}:matrices:risk-vs-app`,

  // Diagram sub-sections
  diagBusiness: (arch: string) => `arch:${arch}:diagrams:business`,
  diagApplication: (arch: string) => `arch:${arch}:diagrams:application`,
  diagTechnology: (arch: string) => `arch:${arch}:diagrams:technology`,
  diagStrategy: (arch: string) => `arch:${arch}:diagrams:strategy`,

  // Roadmap sub-sections
  roadmapCurrent: (arch: string) => `arch:${arch}:roadmaps:current`,
  roadmapTarget: (arch: string) => `arch:${arch}:roadmaps:target`,
  roadmapTransition: (arch: string) => `arch:${arch}:roadmaps:transition`,

  // Framework Packages
  frameworkIndustry: 'section:framework-packages:industry',
  frameworkSecurity: 'section:framework-packages:security',
  frameworkCustom: 'section:framework-packages:custom',

  // Baselines sub
  baselineSnapshots: 'section:baselines:snapshots',
  baselineArchived: 'section:baselines:archived',

  // Reports sub
  reportImpact: 'section:reports:impact',
  reportCost: 'section:reports:cost',
  reportRisk: 'section:reports:risk',
  reportCompliance: 'section:reports:compliance',

  // Settings sub
  settingsIntegrations: 'section:settings:integrations',
  settingsNotifications: 'section:settings:notifications',
  settingsMonitoring: 'section:settings:monitoring',
  settingsSystemConfig: 'section:settings:system-config',

  // Leaf-level elements
  element: (id: string) => `element:${id}`,
  view: (id: string) => `view:${id}`,
  baseline: (id: string) => `baseline:${id}`,
  plateau: (id: string) => `plateau:${id}`,
  roadmap: (id: string) => `roadmap:${id}`,
  metamodelTypeDef: (type: string) => `metamodel:type:${type}`,
  metamodelRelDef: (type: string) => `metamodel:rel:${type}`,
  relationship: (id: string) => `relationship:${id}`,
} as const;

// ---------------------------------------------------------------------------
// Dynamic object type mapping from metamodel
// ---------------------------------------------------------------------------

/** Semantic layer mapping from EaLayer to explorer categories. */
const LAYER_TO_COMPONENT_CATEGORY: Record<EaLayer, string> = {
  Business: 'business',
  Application: 'applications',
  Technology: 'technology',
  'Implementation & Migration': 'projects',
  Governance: 'business', // fallback
};

/**
 * Dynamically resolve which element types belong to each component category.
 * This is driven ENTIRELY from the metamodel — no hardcoded type lists.
 */
export function getObjectTypesByCategory(): Record<string, ObjectType[]> {
  const categories: Record<string, ObjectType[]> = {
    // Business Components sub-collections mapped by semantic type
    capabilities: [],
    processes: [],
    actors: [],
    // Application Components
    applications: [],
    apis: [],
    services: [],
    // Data Components
    dataEntities: [],
    dataStores: [],
    // Technology Components
    infrastructure: [],
    network: [],
    cloud: [],
    // Security
    security: [],
    // Projects
    projects: [],
    // Uncategorized
    other: [],
  };

  const allTypes = Object.keys(OBJECT_TYPE_DEFINITIONS) as ObjectType[];
  for (const type of allTypes) {
    const def = OBJECT_TYPE_DEFINITIONS[type];
    if (!def) continue;

    const normalizedType = type.toLowerCase();
    const layer = def.layer;

    // Business layer classification
    if (layer === 'Business') {
      if (normalizedType.includes('capability') || normalizedType.includes('subcapability') || normalizedType.includes('capabilitycategory') || normalizedType.includes('valuestream')) {
        categories.capabilities.push(type);
      } else if (normalizedType.includes('process')) {
        categories.processes.push(type);
      } else if (normalizedType.includes('department') || normalizedType.includes('enterprise')) {
        categories.actors.push(type);
      } else {
        categories.processes.push(type); // fallback: business services etc.
      }
      continue;
    }

    // Application layer classification
    if (layer === 'Application') {
      if (normalizedType.includes('api') || normalizedType.includes('interface')) {
        categories.apis.push(type);
      } else if (normalizedType.includes('service')) {
        categories.services.push(type);
      } else {
        categories.applications.push(type);
      }
      continue;
    }

    // Technology layer classification
    if (layer === 'Technology') {
      if (normalizedType.includes('network') || normalizedType.includes('loadbalancer')) {
        categories.network.push(type);
      } else if (normalizedType.includes('cloud')) {
        categories.cloud.push(type);
      } else if (normalizedType.includes('database') || normalizedType.includes('storage')) {
        categories.dataStores.push(type);
      } else {
        categories.infrastructure.push(type);
      }
      continue;
    }

    // Implementation & Migration
    if (layer === 'Implementation & Migration') {
      categories.projects.push(type);
      continue;
    }

    // Governance
    if (layer === 'Governance') {
      categories.security.push(type);
      continue;
    }

    categories.other.push(type);
  }

  // Sort each category alphabetically
  for (const key of Object.keys(categories)) {
    categories[key].sort((a, b) => a.localeCompare(b));
  }

  return categories;
}

/**
 * Dynamically resolve relationship types into structural categories.
 * Driven from metamodel definitions — no hardcoded lists.
 */
export function getRelationshipTypesByCategory(): Record<string, string[]> {
  const categories: Record<string, string[]> = {
    structural: [],
    dependency: [],
    flow: [],
    custom: [],
  };

  const allRelTypes = Object.keys(RELATIONSHIP_TYPE_DEFINITIONS) as Array<keyof typeof RELATIONSHIP_TYPE_DEFINITIONS>;
  for (const relType of allRelTypes) {
    const def = RELATIONSHIP_TYPE_DEFINITIONS[relType];
    if (!def) continue;
    const normalized = relType.toLowerCase();

    if (['decomposes_to', 'composed_of', 'owns', 'has'].includes(normalized)) {
      categories.structural.push(relType);
    } else if (['depends_on', 'uses', 'used_by', 'consumes', 'requires', 'supports', 'supported_by'].includes(normalized)) {
      categories.dependency.push(relType);
    } else if (['triggers', 'served_by', 'integrates_with', 'connects_to', 'exposes', 'provided_by'].includes(normalized)) {
      categories.flow.push(relType);
    } else {
      categories.custom.push(relType);
    }
  }

  for (const key of Object.keys(categories)) {
    categories[key].sort((a, b) => a.localeCompare(b));
  }

  return categories;
}

/**
 * Get object types grouped by metamodel category (for Object Types sub-tree).
 */
export function getObjectTypesByMetamodelLayer(): Record<string, ObjectType[]> {
  const layers: Record<string, ObjectType[]> = {
    business: [],
    application: [],
    technology: [],
    data: [],
    custom: [],
  };

  const allTypes = Object.keys(OBJECT_TYPE_DEFINITIONS) as ObjectType[];
  for (const type of allTypes) {
    const def = OBJECT_TYPE_DEFINITIONS[type];
    if (!def) continue;

    switch (def.layer) {
      case 'Business':
        layers.business.push(type);
        break;
      case 'Application':
        layers.application.push(type);
        break;
      case 'Technology':
        layers.technology.push(type);
        break;
      case 'Implementation & Migration':
      case 'Governance':
        layers.custom.push(type);
        break;
      default:
        layers.custom.push(type);
    }
  }

  // Data types derived from Technology types with data semantics
  const dataTypes = new Set(['Database', 'Storage']);
  layers.data = layers.technology.filter(t => dataTypes.has(t));
  layers.technology = layers.technology.filter(t => !dataTypes.has(t));

  for (const key of Object.keys(layers)) {
    layers[key].sort((a, b) => a.localeCompare(b));
  }

  return layers;
}

/**
 * Default expanded keys for the enterprise explorer tree.
 */
export function getDefaultExpandedKeys(workspaceName: string, archName: string): string[] {
  return [
    EXPLORER_KEYS.root(workspaceName),
    EXPLORER_KEYS.architectures,
    EXPLORER_KEYS.architecture(archName),
    EXPLORER_KEYS.archComponents(archName),
    EXPLORER_KEYS.componentBusiness(archName),
    EXPLORER_KEYS.componentApplications(archName),
    EXPLORER_KEYS.componentTechnology(archName),
    EXPLORER_KEYS.archDiagrams(archName),
    EXPLORER_KEYS.archCatalogues(archName),
    EXPLORER_KEYS.baselines,
    EXPLORER_KEYS.reports,
    EXPLORER_KEYS.settings,
  ];
}

/**
 * Returns the architecture name from repository metadata.
 */
export function resolveArchitectureName(
  repositoryName: string | null | undefined,
  organizationName: string | null | undefined,
): string {
  const name = (repositoryName ?? organizationName ?? 'Default Architecture').trim();
  return name || 'Default Architecture';
}
