/**
 * Explorer Tree Builder — Dynamically builds the enterprise-grade DataNode[]
 * tree from live repository state, metamodel, views, baselines, and roadmaps.
 *
 * DESIGN:
 * - All component collections are derived from OBJECT_TYPE_DEFINITIONS
 * - Relationship categories come from RELATIONSHIP_TYPE_DEFINITIONS
 * - Tree children are lazily assembled via useMemo on repository changes
 * - No hardcoded element types — everything flows from the metamodel
 */

import {
  ApartmentOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  BarChartOutlined,
  BlockOutlined,
  BookOutlined,
  BranchesOutlined,
  BuildOutlined,
  CloudOutlined,
  ClusterOutlined,
  CodeOutlined,
  ContainerOutlined,
  ControlOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  FolderOutlined,
  ForkOutlined,
  FundProjectionScreenOutlined,
  GlobalOutlined,
  GoldOutlined,
  LockOutlined,
  NodeIndexOutlined,
  PartitionOutlined,
  ProjectOutlined,
  SafetyOutlined,
  SettingOutlined,
  ShareAltOutlined,
  SolutionOutlined,
  TableOutlined,
  TeamOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import React from 'react';

import type { ViewInstance } from '@/diagram-studio/viewpoints/ViewInstance';
import { ViewpointRegistry } from '@/diagram-studio/viewpoints/ViewpointRegistry';
import type { ObjectType, RelationshipType } from '@/pages/dependency-view/utils/eaMetaModel';
import {
  OBJECT_TYPE_DEFINITIONS,
  RELATIONSHIP_TYPE_DEFINITIONS,
} from '@/pages/dependency-view/utils/eaMetaModel';
import type { EaRepositoryMetadata } from '@/repository/repositoryMetadata';
import {
  isObjectTypeEnabledForFramework,
} from '@/repository/customFrameworkConfig';
import {
  isObjectTypeAllowedForReferenceFramework,
} from '@/repository/referenceFrameworkPolicy';

import type { Baseline } from '../../../../backend/baselines/Baseline';
import type { Plateau } from '../../../../backend/roadmap/Plateau';
import type { Roadmap } from '../../../../backend/roadmap/Roadmap';
import {
  EXPLORER_KEYS,
  getObjectTypesByCategory,
  getObjectTypesByMetamodelLayer,
  getRelationshipTypesByCategory,
  resolveArchitectureName,
} from './explorerNodeRegistry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isSoftDeleted = (attributes: Record<string, unknown> | null | undefined): boolean => {
  if ((attributes as any)?._deleted === true) return true;
  const modelingState = String((attributes as any)?.modelingState ?? '').trim().toUpperCase();
  return modelingState === 'DRAFT';
};

const nameForObject = (obj: { id: string; attributes?: Record<string, unknown> }): string => {
  const raw = (obj.attributes as any)?.name;
  const name = typeof raw === 'string' ? raw.trim() : '';
  return name || obj.id;
};

const titleForObjectType = (type: ObjectType): string => {
  // Derive display name from PascalCase → Title Case
  return type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
};

const iconForLayer = (layer: string): React.ReactNode => {
  switch (layer) {
    case 'Business': return <BankOutlined />;
    case 'Application': return <AppstoreOutlined />;
    case 'Technology': return <CloudOutlined />;
    case 'Data': return <DatabaseOutlined />;
    case 'Implementation & Migration': return <ProjectOutlined />;
    case 'Governance': return <SafetyOutlined />;
    default: return <FolderOutlined />;
  }
};

const iconForObjectType = (type: ObjectType): React.ReactNode => {
  const def = OBJECT_TYPE_DEFINITIONS[type];
  if (!def) return <FolderOutlined />;
  const normalized = type.toLowerCase();
  if (normalized.includes('enterprise')) return <BankOutlined />;
  if (normalized.includes('capability') || normalized.includes('valuestream')) return <ApartmentOutlined />;
  if (normalized.includes('process')) return <ForkOutlined />;
  if (normalized.includes('department')) return <TeamOutlined />;
  if (normalized.includes('application') && !normalized.includes('service')) return <AppstoreOutlined />;
  if (normalized.includes('service')) return <DeploymentUnitOutlined />;
  if (normalized.includes('interface') || normalized.includes('api')) return <CodeOutlined />;
  if (normalized.includes('database')) return <DatabaseOutlined />;
  if (normalized.includes('storage')) return <ContainerOutlined />;
  if (normalized.includes('cloud')) return <CloudOutlined />;
  if (normalized.includes('network') || normalized.includes('loadbalancer')) return <ClusterOutlined />;
  if (normalized.includes('node') || normalized.includes('server') || normalized.includes('compute') || normalized.includes('vm') || normalized.includes('container') || normalized.includes('runtime')) return <BuildOutlined />;
  if (normalized.includes('messagebroker') || normalized.includes('integrationplatform')) return <ShareAltOutlined />;
  if (normalized.includes('programme') || normalized.includes('project')) return <ProjectOutlined />;
  if (normalized.includes('principle') || normalized.includes('standard') || normalized.includes('requirement')) return <BookOutlined />;
  return iconForLayer(def.layer);
};

// ---------------------------------------------------------------------------
// Leaf node factories
// ---------------------------------------------------------------------------

function elementLeaves(
  objectsById: Map<string, { id: string; type: ObjectType; attributes: Record<string, unknown> }>,
  types: readonly ObjectType[],
): DataNode[] {
  const typeSet = new Set(types);
  const items = Array.from(objectsById.values())
    .filter(o => typeSet.has(o.type) && !isSoftDeleted(o.attributes));
  items.sort((a, b) => nameForObject(a).localeCompare(nameForObject(b)) || a.id.localeCompare(b.id));
  return items.map(o => ({
    key: EXPLORER_KEYS.element(o.id),
    title: nameForObject(o),
    icon: iconForObjectType(o.type),
    isLeaf: true,
    data: { elementId: o.id, elementType: o.type },
  }));
}

function viewLeaf(v: ViewInstance): DataNode {
  const viewpoint = ViewpointRegistry.get(v.viewpointId);
  const label = viewpoint?.name ?? v.viewpointId;
  return {
    key: EXPLORER_KEYS.view(v.id),
    title: React.createElement('span', null,
      v.name,
      ' ',
      React.createElement('span', { style: { color: '#8c8c8c' } }, `(${label})`),
    ),
    icon: React.createElement(FileTextOutlined),
    isLeaf: true,
    data: { viewId: v.id },
  };
}

function baselineLeaf(b: Baseline): DataNode {
  return {
    key: EXPLORER_KEYS.baseline(b.id),
    title: b.name || b.id,
    icon: React.createElement(SafetyOutlined),
    isLeaf: true,
    data: { baselineId: b.id },
  };
}

function plateauLeaf(p: Plateau): DataNode {
  return {
    key: EXPLORER_KEYS.plateau(p.id),
    title: p.name,
    icon: React.createElement(FundProjectionScreenOutlined),
    isLeaf: true,
    data: { plateauId: p.id },
  };
}

function roadmapLeaf(r: Roadmap): DataNode {
  return {
    key: EXPLORER_KEYS.roadmap(r.id),
    title: r.name,
    icon: React.createElement(FundProjectionScreenOutlined),
    isLeaf: true,
    data: { roadmapId: r.id },
  };
}

function relationshipLeaf(rel: { id?: string; fromId: string; toId: string; type: string }, objectsById: Map<string, any>): DataNode {
  const source = objectsById.get(rel.fromId);
  const target = objectsById.get(rel.toId);
  const sourceLabel = source ? nameForObject(source) : rel.fromId;
  const targetLabel = target ? nameForObject(target) : rel.toId;
  const id = rel.id ?? `${rel.fromId}-${rel.type}-${rel.toId}`;
  return {
    key: EXPLORER_KEYS.relationship(id),
    title: `${sourceLabel} → ${rel.type} → ${targetLabel}`,
    icon: React.createElement(BranchesOutlined),
    isLeaf: true,
    data: { connectionType: rel.type },
  };
}

function collectionNode(key: string, title: string, icon: React.ReactNode, children: DataNode[]): DataNode {
  return { key, title, icon, selectable: true, children };
}

function emptyPlaceholder(parentKey: string, message: string): DataNode {
  return {
    key: `${parentKey}:empty`,
    title: message,
    icon: React.createElement(FileTextOutlined),
    isLeaf: true,
    selectable: false,
  };
}

// ---------------------------------------------------------------------------
// View grouping
// ---------------------------------------------------------------------------

function categorizeView(view: ViewInstance): 'business' | 'application' | 'technology' | 'strategy' {
  const viewpoint = ViewpointRegistry.get(view.viewpointId);
  if (!viewpoint) return 'business';

  const businessTypes = new Set<ObjectType>([
    'Enterprise', 'Department', 'CapabilityCategory', 'Capability', 'SubCapability',
    'BusinessService', 'BusinessProcess',
  ]);
  const applicationTypes = new Set<ObjectType>([
    'Application', 'ApplicationService', 'Interface',
  ]);
  const technologyTypes = new Set<ObjectType>([
    'Technology', 'Node', 'Compute', 'Runtime', 'Database', 'Storage',
    'API', 'MessageBroker', 'IntegrationPlatform', 'CloudService',
  ]);

  let bScore = 0, aScore = 0, tScore = 0;
  viewpoint.allowedElementTypes.forEach(t => {
    if (businessTypes.has(t)) bScore += 1;
    if (applicationTypes.has(t)) aScore += 1;
    if (technologyTypes.has(t)) tScore += 1;
  });

  if (aScore >= bScore && aScore >= tScore) return 'application';
  if (tScore >= bScore && tScore >= aScore) return 'technology';
  return 'business';
}

// ---------------------------------------------------------------------------
// Visibility filter
// ---------------------------------------------------------------------------

function isObjectTypeVisible(
  type: ObjectType,
  metadata: EaRepositoryMetadata | null,
): boolean {
  const frameworks = metadata?.enabledFrameworks?.length
    ? metadata.enabledFrameworks
    : metadata?.referenceFramework
      ? [metadata.referenceFramework]
      : [];
  if (frameworks.length === 0) return true;
  return frameworks.some(framework => {
    if (framework === 'Custom') {
      return isObjectTypeEnabledForFramework('Custom', metadata?.frameworkConfig ?? undefined, type);
    }
    return isObjectTypeAllowedForReferenceFramework(framework, type);
  });
}

// ---------------------------------------------------------------------------
// MAIN TREE BUILDER
// ---------------------------------------------------------------------------

export type ExplorerTreeInput = {
  objectsById: Map<string, { id: string; type: ObjectType; attributes: Record<string, unknown> }>;
  relationships: ReadonlyArray<{ id?: string; fromId: string; toId: string; type: string }>;
  metadata: EaRepositoryMetadata | null;
  views: readonly ViewInstance[];
  baselines: readonly Baseline[];
  plateaus: readonly Plateau[];
  roadmaps: readonly Roadmap[];
};

export type ExplorerTreeResult = {
  treeData: DataNode[];
  elementKeyIndex: Map<string, string>;
};

/**
 * Build the complete enterprise-grade explorer tree.
 *
 * Structure:
 * Workspace: <Name>.ea
 * ├── Repository (Properties, Audit Trail, Users & Roles, Access Control)
 * ├── Metamodel (Standards, Object Types, Relationship Types, Attributes, Viewpoints)
 * ├── Architectures → <ArchitectureName>
 * │   ├── Components (Business, Applications, Data, Technology, Security, Projects)
 * │   ├── Connections (All, App Deps, Data Flows, Deployments, Integrations)
 * │   ├── Catalogues (App, Tech, Risk, Vendor, Project Portfolio)
 * │   ├── Matrices (App vs Cap, App vs Tech, Cap vs Proc, Risk vs App)
 * │   ├── Diagrams (Business, Application, Technology, Strategy)
 * │   └── Roadmaps (Current, Target, Transition)
 * ├── Framework Packages (Industry, Security, Custom)
 * ├── Baselines (Snapshots, Archived)
 * ├── Reports (Impact, Cost, Risk, Compliance)
 * └── Settings (Integrations, Notifications, Monitoring, System Config)
 */
export function buildExplorerTree(input: ExplorerTreeInput): ExplorerTreeResult {
  const { objectsById, relationships, metadata, views, baselines, plateaus, roadmaps } = input;

  const workspaceName = (metadata?.repositoryName ?? 'Workspace').trim() || 'Workspace';
  const archName = resolveArchitectureName(metadata?.repositoryName, metadata?.organizationName);
  const categories = getObjectTypesByCategory();
  const metamodelLayers = getObjectTypesByMetamodelLayer();
  const relCategories = getRelationshipTypesByCategory();

  // Filter types by framework visibility
  const visibleTypes = (types: ObjectType[]) => types.filter(t => isObjectTypeVisible(t, metadata));

  const savedViews = views.filter(v => v.status === 'SAVED');
  const businessViews = savedViews.filter(v => categorizeView(v) === 'business');
  const applicationViews = savedViews.filter(v => categorizeView(v) === 'application');
  const technologyViews = savedViews.filter(v => categorizeView(v) === 'technology');
  const strategyViews = savedViews.filter(v => categorizeView(v) === 'strategy');

  // --- 1. Repository ---
  const repositoryNode: DataNode = collectionNode(
    EXPLORER_KEYS.repository, 'Repository', React.createElement(DatabaseOutlined),
    [
      { key: EXPLORER_KEYS.repoProperties, title: 'Properties', icon: React.createElement(FileProtectOutlined), isLeaf: true, data: { settingKey: 'repository-properties' } },
      { key: EXPLORER_KEYS.repoAuditTrail, title: 'Audit Trail', icon: React.createElement(AuditOutlined), isLeaf: true, data: { settingKey: 'audit-trail' } },
      { key: EXPLORER_KEYS.repoUsersRoles, title: 'Users & Roles', icon: React.createElement(TeamOutlined), isLeaf: true, data: { settingKey: 'users-roles' } },
      { key: EXPLORER_KEYS.repoAccessControl, title: 'Access Control', icon: React.createElement(LockOutlined), isLeaf: true, data: { settingKey: 'access-control' } },
    ],
  );

  // --- 2. Metamodel ---
  const metamodelObjectTypeChildren = (() => {
    const cats: DataNode[] = [];
    const layerEntries: [string, string, ObjectType[]][] = [
      [EXPLORER_KEYS.objectTypeBusiness, 'Business Types', metamodelLayers.business],
      [EXPLORER_KEYS.objectTypeApplication, 'Application Types', metamodelLayers.application],
      [EXPLORER_KEYS.objectTypeTechnology, 'Technology Types', metamodelLayers.technology],
      [EXPLORER_KEYS.objectTypeData, 'Data Types', metamodelLayers.data],
      [EXPLORER_KEYS.objectTypeCustom, 'Custom Types', metamodelLayers.custom],
    ];
    for (const [key, title, types] of layerEntries) {
      const visible = visibleTypes(types);
      cats.push(collectionNode(key, title, React.createElement(GoldOutlined), visible.map(t => ({
        key: EXPLORER_KEYS.metamodelTypeDef(t),
        title: titleForObjectType(t),
        icon: iconForObjectType(t),
        isLeaf: true,
        data: { metamodelType: t },
      }))));
    }
    return cats;
  })();

  const metamodelRelTypeChildren = (() => {
    const entries: [string, string, string[]][] = [
      [EXPLORER_KEYS.relTypeStructural, 'Structural', relCategories.structural],
      [EXPLORER_KEYS.relTypeDependency, 'Dependency', relCategories.dependency],
      [EXPLORER_KEYS.relTypeFlow, 'Flow', relCategories.flow],
      [EXPLORER_KEYS.relTypeCustom, 'Custom', relCategories.custom],
    ];
    return entries.map(([key, title, types]) =>
      collectionNode(key, title, React.createElement(BranchesOutlined), types.map(t => ({
        key: EXPLORER_KEYS.metamodelRelDef(t),
        title: t.replace(/_/g, ' '),
        icon: React.createElement(BranchesOutlined),
        isLeaf: true,
        data: { metamodelType: t },
      }))),
    );
  })();

  const metamodelNode: DataNode = collectionNode(
    EXPLORER_KEYS.metamodel, 'Metamodel', React.createElement(GoldOutlined),
    [
      { key: EXPLORER_KEYS.metamodelStandards, title: 'Standards', icon: React.createElement(BookOutlined), isLeaf: true, data: { settingKey: 'metamodel-standards' } },
      collectionNode(EXPLORER_KEYS.metamodelObjectTypes, 'Object Types', React.createElement(BlockOutlined), metamodelObjectTypeChildren),
      collectionNode(EXPLORER_KEYS.metamodelRelTypes, 'Relationship Types', React.createElement(BranchesOutlined), metamodelRelTypeChildren),
      collectionNode(EXPLORER_KEYS.metamodelAttributes, 'Attributes', React.createElement(TableOutlined), [
        { key: EXPLORER_KEYS.attributesGlobal, title: 'Global Attributes', icon: React.createElement(GlobalOutlined), isLeaf: true },
        { key: EXPLORER_KEYS.attributesTypeSpecific, title: 'Type-Specific Attributes', icon: React.createElement(ControlOutlined), isLeaf: true },
        { key: EXPLORER_KEYS.attributesCalculated, title: 'Calculated Attributes', icon: React.createElement(DashboardOutlined), isLeaf: true },
      ]),
      collectionNode(EXPLORER_KEYS.metamodelViewpoints, 'Viewpoints', React.createElement(SolutionOutlined), [
        collectionNode(EXPLORER_KEYS.viewpointsBusiness, 'Business Views', React.createElement(BankOutlined), []),
        collectionNode(EXPLORER_KEYS.viewpointsApplication, 'Application Views', React.createElement(AppstoreOutlined), []),
        collectionNode(EXPLORER_KEYS.viewpointsTechnology, 'Technology Views', React.createElement(CloudOutlined), []),
        collectionNode(EXPLORER_KEYS.viewpointsStrategy, 'Strategy Views', React.createElement(FundProjectionScreenOutlined), []),
      ]),
    ],
  );

  // --- 3. Architectures -> <ArchitectureName> ---
  const visCapabilities = visibleTypes(categories.capabilities);
  const visProcesses = visibleTypes(categories.processes);
  const visActors = visibleTypes(categories.actors);
  const visApplications = visibleTypes(categories.applications);
  const visAPIs = visibleTypes(categories.apis);
  const visServices = visibleTypes(categories.services);
  const visDataEntities: ObjectType[] = []; // data entities are modeled conceptually
  const visDataStores = visibleTypes(categories.dataStores);
  const visInfrastructure = visibleTypes(categories.infrastructure);
  const visNetwork = visibleTypes(categories.network);
  const visCloud = visibleTypes(categories.cloud);
  const visSecurity = visibleTypes(categories.security);
  const visProjects = visibleTypes(categories.projects);

  // Components sub-tree
  const businessNode: DataNode = collectionNode(
    EXPLORER_KEYS.componentBusiness(archName), 'Business', React.createElement(BankOutlined),
    [
      collectionNode(EXPLORER_KEYS.businessCapabilities(archName), 'Capabilities', React.createElement(ApartmentOutlined),
        elementLeaves(objectsById, visCapabilities)),
      collectionNode(EXPLORER_KEYS.businessProcesses(archName), 'Processes', React.createElement(ForkOutlined),
        elementLeaves(objectsById, visProcesses)),
      collectionNode(EXPLORER_KEYS.businessActors(archName), 'Actors', React.createElement(TeamOutlined),
        elementLeaves(objectsById, visActors)),
    ],
  );

  const applicationsNode: DataNode = collectionNode(
    EXPLORER_KEYS.componentApplications(archName), 'Applications', React.createElement(AppstoreOutlined),
    [
      collectionNode(EXPLORER_KEYS.appApplications(archName), 'Applications', React.createElement(AppstoreOutlined),
        elementLeaves(objectsById, visApplications)),
      collectionNode(EXPLORER_KEYS.appAPIs(archName), 'APIs', React.createElement(CodeOutlined),
        elementLeaves(objectsById, visAPIs)),
      collectionNode(EXPLORER_KEYS.appServices(archName), 'Services', React.createElement(DeploymentUnitOutlined),
        elementLeaves(objectsById, visServices)),
    ],
  );

  const dataNode: DataNode = collectionNode(
    EXPLORER_KEYS.componentData(archName), 'Data', React.createElement(DatabaseOutlined),
    [
      collectionNode(EXPLORER_KEYS.dataEntities(archName), 'Data Entities', React.createElement(TableOutlined),
        elementLeaves(objectsById, visDataEntities)),
      collectionNode(EXPLORER_KEYS.dataStores(archName), 'Data Stores', React.createElement(ContainerOutlined),
        elementLeaves(objectsById, visDataStores)),
    ],
  );

  const technologyNode: DataNode = collectionNode(
    EXPLORER_KEYS.componentTechnology(archName), 'Technology', React.createElement(CloudOutlined),
    [
      collectionNode(EXPLORER_KEYS.techInfrastructure(archName), 'Infrastructure', React.createElement(BuildOutlined),
        elementLeaves(objectsById, visInfrastructure)),
      collectionNode(EXPLORER_KEYS.techNetwork(archName), 'Network', React.createElement(ClusterOutlined),
        elementLeaves(objectsById, visNetwork)),
      collectionNode(EXPLORER_KEYS.techCloud(archName), 'Cloud Resources', React.createElement(CloudOutlined),
        elementLeaves(objectsById, visCloud)),
    ],
  );

  const securityNode: DataNode = collectionNode(
    EXPLORER_KEYS.componentSecurity(archName), 'Security', React.createElement(LockOutlined),
    elementLeaves(objectsById, visSecurity),
  );

  const projectsNode: DataNode = collectionNode(
    EXPLORER_KEYS.componentProjects(archName), 'Projects', React.createElement(ProjectOutlined),
    elementLeaves(objectsById, visProjects),
  );

  const componentsNode: DataNode = collectionNode(
    EXPLORER_KEYS.archComponents(archName), 'Components', React.createElement(BlockOutlined),
    [businessNode, applicationsNode, dataNode, technologyNode, securityNode, projectsNode],
  );

  // Connections sub-tree
  const filterRelsByTypes = (relTypes: string[]): DataNode[] => {
    const typeSet = new Set(relTypes.map(t => t.toLowerCase()));
    return relationships
      .filter(r => typeSet.has(r.type.toLowerCase()))
      .slice(0, 200) // Cap for performance
      .map(r => relationshipLeaf(r, objectsById));
  };

  const connectionsNode: DataNode = collectionNode(
    EXPLORER_KEYS.archConnections(archName), 'Connections', React.createElement(BranchesOutlined),
    [
      collectionNode(EXPLORER_KEYS.connAllRelationships(archName), 'All Relationships', React.createElement(ShareAltOutlined),
        relationships.slice(0, 200).map(r => relationshipLeaf(r, objectsById))),
      collectionNode(EXPLORER_KEYS.connAppDependencies(archName), 'Application Dependencies', React.createElement(NodeIndexOutlined),
        filterRelsByTypes(['DEPENDS_ON', 'USES', 'USED_BY', 'CONSUMES'])),
      collectionNode(EXPLORER_KEYS.connDataFlows(archName), 'Data Flows', React.createElement(ForkOutlined),
        filterRelsByTypes(['TRIGGERS', 'SERVED_BY', 'INTEGRATES_WITH', 'CONNECTS_TO'])),
      collectionNode(EXPLORER_KEYS.connDeployments(archName), 'Deployments', React.createElement(DeploymentUnitOutlined),
        filterRelsByTypes(['DEPLOYED_ON', 'SUPPORTED_BY'])),
      collectionNode(EXPLORER_KEYS.connIntegrations(archName), 'Integrations', React.createElement(ShareAltOutlined),
        filterRelsByTypes(['INTEGRATES_WITH', 'EXPOSES', 'PROVIDED_BY'])),
    ],
  );

  // Catalogues sub-tree
  const cataloguesNode: DataNode = collectionNode(
    EXPLORER_KEYS.archCatalogues(archName), 'Catalogues', React.createElement(BookOutlined),
    [
      { key: EXPLORER_KEYS.catApplication(archName), title: 'Application Catalogue', icon: React.createElement(AppstoreOutlined), isLeaf: true, data: { catalogKey: 'applications' } },
      { key: EXPLORER_KEYS.catTechnology(archName), title: 'Technology Catalogue', icon: React.createElement(CloudOutlined), isLeaf: true, data: { catalogKey: 'technology' } },
      { key: EXPLORER_KEYS.catRisk(archName), title: 'Risk Register', icon: React.createElement(SafetyOutlined), isLeaf: true, data: { catalogKey: 'risk' } },
      { key: EXPLORER_KEYS.catVendor(archName), title: 'Vendor Register', icon: React.createElement(SolutionOutlined), isLeaf: true, data: { catalogKey: 'vendor' } },
      { key: EXPLORER_KEYS.catProjectPortfolio(archName), title: 'Project Portfolio', icon: React.createElement(ProjectOutlined), isLeaf: true, data: { catalogKey: 'project-portfolio' } },
    ],
  );

  // Matrices sub-tree
  const matricesNode: DataNode = collectionNode(
    EXPLORER_KEYS.archMatrices(archName), 'Matrices', React.createElement(TableOutlined),
    [
      { key: EXPLORER_KEYS.matAppVsCap(archName), title: 'App vs Capability', icon: React.createElement(TableOutlined), isLeaf: true, data: { matrixKey: 'app-vs-cap' } },
      { key: EXPLORER_KEYS.matAppVsTech(archName), title: 'App vs Technology', icon: React.createElement(TableOutlined), isLeaf: true, data: { matrixKey: 'app-vs-tech' } },
      { key: EXPLORER_KEYS.matCapVsProc(archName), title: 'Capability vs Process', icon: React.createElement(TableOutlined), isLeaf: true, data: { matrixKey: 'cap-vs-proc' } },
      { key: EXPLORER_KEYS.matRiskVsApp(archName), title: 'Risk vs Application', icon: React.createElement(TableOutlined), isLeaf: true, data: { matrixKey: 'risk-vs-app' } },
    ],
  );

  // Diagrams sub-tree
  const makeDiagramCategory = (key: string, title: string, catViews: ViewInstance[]): DataNode =>
    collectionNode(key, title, React.createElement(PartitionOutlined),
      catViews.length > 0 ? catViews.map(viewLeaf) : [emptyPlaceholder(key, 'No diagrams')]);

  const diagramsNode: DataNode = collectionNode(
    EXPLORER_KEYS.archDiagrams(archName), 'Diagrams', React.createElement(PartitionOutlined),
    [
      makeDiagramCategory(EXPLORER_KEYS.diagBusiness(archName), 'Business Diagrams', businessViews),
      makeDiagramCategory(EXPLORER_KEYS.diagApplication(archName), 'Application Diagrams', applicationViews),
      makeDiagramCategory(EXPLORER_KEYS.diagTechnology(archName), 'Technology Diagrams', technologyViews),
      makeDiagramCategory(EXPLORER_KEYS.diagStrategy(archName), 'Strategy Diagrams', strategyViews),
    ],
  );

  // Roadmaps sub-tree
  const currentStateRoadmaps = roadmaps.filter(r => {
    const name = (r.name ?? '').toLowerCase();
    return name.includes('current') || name.includes('as-is') || name.includes('baseline');
  });
  const targetStateRoadmaps = roadmaps.filter(r => {
    const name = (r.name ?? '').toLowerCase();
    return name.includes('target') || name.includes('to-be') || name.includes('future');
  });
  const transitionRoadmaps = roadmaps.filter(r =>
    !currentStateRoadmaps.includes(r) && !targetStateRoadmaps.includes(r),
  );

  const roadmapsNode: DataNode = collectionNode(
    EXPLORER_KEYS.archRoadmaps(archName), 'Roadmaps', React.createElement(FundProjectionScreenOutlined),
    [
      collectionNode(EXPLORER_KEYS.roadmapCurrent(archName), 'Current State', React.createElement(DashboardOutlined),
        currentStateRoadmaps.length > 0 ? currentStateRoadmaps.map(roadmapLeaf) : [emptyPlaceholder(EXPLORER_KEYS.roadmapCurrent(archName), 'No current state roadmaps')]),
      collectionNode(EXPLORER_KEYS.roadmapTarget(archName), 'Target State', React.createElement(FundProjectionScreenOutlined),
        targetStateRoadmaps.length > 0 ? targetStateRoadmaps.map(roadmapLeaf) : [emptyPlaceholder(EXPLORER_KEYS.roadmapTarget(archName), 'No target state roadmaps')]),
      collectionNode(EXPLORER_KEYS.roadmapTransition(archName), 'Transition States', React.createElement(BarChartOutlined),
        transitionRoadmaps.length > 0
          ? [...transitionRoadmaps.map(roadmapLeaf), ...plateaus.map(plateauLeaf)]
          : plateaus.length > 0
            ? plateaus.map(plateauLeaf)
            : [emptyPlaceholder(EXPLORER_KEYS.roadmapTransition(archName), 'No transition states')]),
    ],
  );

  // The Architecture container
  const architectureNode: DataNode = collectionNode(
    EXPLORER_KEYS.architecture(archName), archName, React.createElement(PartitionOutlined),
    [componentsNode, connectionsNode, cataloguesNode, matricesNode, diagramsNode, roadmapsNode],
  );

  const architecturesNode: DataNode = collectionNode(
    EXPLORER_KEYS.architectures, 'Architectures', React.createElement(PartitionOutlined),
    [architectureNode],
  );

  // --- 4. Framework Packages ---
  const frameworkPackagesNode: DataNode = collectionNode(
    EXPLORER_KEYS.frameworkPackages, 'Framework Packages', React.createElement(ToolOutlined),
    [
      { key: EXPLORER_KEYS.frameworkIndustry, title: 'Industry Frameworks', icon: React.createElement(GlobalOutlined), isLeaf: true },
      { key: EXPLORER_KEYS.frameworkSecurity, title: 'Security Frameworks', icon: React.createElement(LockOutlined), isLeaf: true },
      { key: EXPLORER_KEYS.frameworkCustom, title: 'Custom Frameworks', icon: React.createElement(ToolOutlined), isLeaf: true },
    ],
  );

  // --- 5. Baselines ---
  const activeBaselines = baselines.filter(b => !b.description?.toLowerCase().includes('archived'));
  const archivedBaselines = baselines.filter(b => b.description?.toLowerCase().includes('archived'));

  const baselinesNode: DataNode = collectionNode(
    EXPLORER_KEYS.baselines, 'Baselines', React.createElement(SafetyOutlined),
    [
      collectionNode(EXPLORER_KEYS.baselineSnapshots, 'Snapshots', React.createElement(FileProtectOutlined),
        activeBaselines.length > 0 ? activeBaselines.map(baselineLeaf) : [emptyPlaceholder(EXPLORER_KEYS.baselineSnapshots, 'No snapshots')]),
      collectionNode(EXPLORER_KEYS.baselineArchived, 'Archived States', React.createElement(ContainerOutlined),
        archivedBaselines.length > 0 ? archivedBaselines.map(baselineLeaf) : [emptyPlaceholder(EXPLORER_KEYS.baselineArchived, 'No archived states')]),
    ],
  );

  // --- 6. Reports ---
  const reportsNode: DataNode = collectionNode(
    EXPLORER_KEYS.reports, 'Reports', React.createElement(BarChartOutlined),
    [
      { key: EXPLORER_KEYS.reportImpact, title: 'Impact Analysis Reports', icon: React.createElement(NodeIndexOutlined), isLeaf: true, data: { reportType: 'impact' } },
      { key: EXPLORER_KEYS.reportCost, title: 'Cost Reports', icon: React.createElement(BarChartOutlined), isLeaf: true, data: { reportType: 'cost' } },
      { key: EXPLORER_KEYS.reportRisk, title: 'Risk Reports', icon: React.createElement(SafetyOutlined), isLeaf: true, data: { reportType: 'risk' } },
      { key: EXPLORER_KEYS.reportCompliance, title: 'Compliance Reports', icon: React.createElement(FileProtectOutlined), isLeaf: true, data: { reportType: 'compliance' } },
    ],
  );

  // --- 7. Settings ---
  const settingsNode: DataNode = collectionNode(
    EXPLORER_KEYS.settings, 'Settings', React.createElement(SettingOutlined),
    [
      { key: EXPLORER_KEYS.settingsIntegrations, title: 'Integrations', icon: React.createElement(ShareAltOutlined), isLeaf: true, data: { settingKey: 'integrations' } },
      { key: EXPLORER_KEYS.settingsNotifications, title: 'Notification Rules', icon: React.createElement(SolutionOutlined), isLeaf: true, data: { settingKey: 'notifications' } },
      { key: EXPLORER_KEYS.settingsMonitoring, title: 'Monitoring Bindings', icon: React.createElement(DashboardOutlined), isLeaf: true, data: { settingKey: 'monitoring' } },
      { key: EXPLORER_KEYS.settingsSystemConfig, title: 'System Configuration', icon: React.createElement(ControlOutlined), isLeaf: true, data: { settingKey: 'system-config' } },
    ],
  );

  // --- Root ---
  const rootNode: DataNode = collectionNode(
    EXPLORER_KEYS.root(workspaceName), `${workspaceName}.ea`, React.createElement(FolderOutlined),
    [repositoryNode, metamodelNode, architecturesNode, frameworkPackagesNode, baselinesNode, reportsNode, settingsNode],
  );

  const treeData: DataNode[] = [rootNode];

  // --- Element Key Index ---
  const elementKeyIndex = new Map<string, string>();
  const walk = (nodes: DataNode[]) => {
    for (const node of nodes) {
      const data = (node as any)?.data as { elementId?: string } | undefined;
      if (data?.elementId && typeof node.key === 'string' && !elementKeyIndex.has(data.elementId)) {
        elementKeyIndex.set(data.elementId, node.key);
      }
      if (node.children) walk(node.children);
    }
  };
  walk(treeData);

  return { treeData, elementKeyIndex };
}
