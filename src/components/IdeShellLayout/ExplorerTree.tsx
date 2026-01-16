import {
  ApartmentOutlined,
  AppstoreOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  CheckOutlined,
  CloudOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  FileTextOutlined,
  ForkOutlined,
  FundProjectionScreenOutlined,
  PlusOutlined,
  ProjectOutlined,
  SafetyOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Alert, Button, Descriptions, Dropdown, Form, Input, Modal, Select, Space, Tree, Typography, message, notification } from 'antd';
import type { MenuProps } from 'antd';
import type { DataNode, TreeProps } from 'antd/es/tree';
import React from 'react';
import { useModel } from '@umijs/max';
import { useIdeShell } from './index';
import styles from './style.module.less';
import { useIdeSelection } from '@/ide/IdeSelectionContext';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import type { ObjectType, RelationshipType } from '@/pages/dependency-view/utils/eaMetaModel';
import {
  OBJECT_TYPE_DEFINITIONS,
  RELATIONSHIP_TYPE_DEFINITIONS,
  isValidRelationshipType,
} from '@/pages/dependency-view/utils/eaMetaModel';
import { isCustomFrameworkModelingEnabled } from '@/repository/customFrameworkConfig';
import { isObjectTypeAllowedForReferenceFramework } from '@/repository/referenceFrameworkPolicy';
import { hasRepositoryPermission, type RepositoryRole } from '@/repository/accessControl';
import { guardInitializationForModeling } from '@/repository/elementCreationPolicy';
import { getViewRepository, deleteView as deleteViewById, updateViewRoot } from '../../../backend/views/ViewRepositoryStore';
import { ViewStore } from '@/diagram-studio/view-runtime/ViewStore';
import type { ViewInstance } from '@/diagram-studio/viewpoints/ViewInstance';
import { ViewpointRegistry } from '@/diagram-studio/viewpoints/ViewpointRegistry';
import type { ViewDefinition } from '../../../backend/views/ViewDefinition';
import { isObjectTypeEnabledForFramework } from '@/repository/customFrameworkConfig';
import { useSeedSampleData } from '@/ea/useSeedSampleData';
import { listBaselines, getBaselineById } from '../../../backend/baselines/BaselineStore';
import type { Baseline } from '../../../backend/baselines/Baseline';
import { listPlateaus, getPlateauById } from '../../../backend/roadmap/PlateauStore';
import type { Plateau } from '../../../backend/roadmap/Plateau';
import { getRoadmapById, listRoadmaps } from '../../../backend/roadmap/RoadmapStore';
import type { Roadmap } from '../../../backend/roadmap/Roadmap';

const ROOT_KEYS = {
  business: 'explorer:business',
  application: 'explorer:application',
  technology: 'explorer:technology',
  implMig: 'explorer:implementation-migration',
  governance: 'explorer:governance',
  views: 'explorer:views',
  baselines: 'explorer:baselines',
} as const;

const ENTERPRISE_FULLY_EXPANDED_KEYS: readonly string[] = [
  ROOT_KEYS.business,
  ROOT_KEYS.application,
  ROOT_KEYS.technology,
  ROOT_KEYS.implMig,
  ROOT_KEYS.governance,
  ROOT_KEYS.views,
  ROOT_KEYS.baselines,

  'explorer:business:enterprises',
  'explorer:business:capabilities',
  'explorer:business:business-services',
  'explorer:business:processes',
  'explorer:business:departments',

  'explorer:application:applications',
  'explorer:application:application-services',

  'explorer:technology:technologies',

  'explorer:implmig:programmes',
  'explorer:implmig:projects',
  'explorer:implmig:plateaus',

  'explorer:governance:principles',
  'explorer:governance:requirements',

  'explorer:views:business',
  'explorer:views:application',
  'explorer:views:technology',
  'explorer:views:roadmaps',
  'explorer:baselines:list',
];

const KEY = {
  element: (id: string) => `explorer:element:${id}`,
  view: (id: string) => `explorer:view:${id}`,
  baseline: (id: string) => `explorer:baseline:${id}`,
  plateau: (id: string) => `explorer:plateau:${id}`,
  roadmap: (id: string) => `explorer:roadmap:${id}`,
} as const;

/** Get the collection key for a given element type (for auto-expanding after creation) */
const getCollectionKeyForType = (type: ObjectType): string | null => {
  switch (type) {
    case 'Enterprise':
      return 'explorer:business:enterprises';
    case 'Capability':
      return 'explorer:business:capabilities';
    case 'BusinessService':
      return 'explorer:business:business-services';
    case 'BusinessProcess':
      return 'explorer:business:processes';
    case 'Department':
      return 'explorer:business:departments';
    case 'Application':
      return 'explorer:application:applications';
    case 'ApplicationService':
      return 'explorer:application:application-services';
    case 'Technology':
      return 'explorer:technology:technologies';
    case 'Programme':
      return 'explorer:implmig:programmes';
    case 'Project':
      return 'explorer:implmig:projects';
    case 'Principle':
      return 'explorer:governance:principles';
    case 'Requirement':
      return 'explorer:governance:requirements';
    default:
      return null;
  }
};

/** Get the parent root key for a given element type */
const getRootKeyForType = (type: ObjectType): string | null => {
  switch (type) {
    case 'Enterprise':
    case 'Capability':
    case 'BusinessService':
    case 'BusinessProcess':
    case 'Department':
      return ROOT_KEYS.business;
    case 'Application':
    case 'ApplicationService':
      return ROOT_KEYS.application;
    case 'Technology':
      return ROOT_KEYS.technology;
    case 'Programme':
    case 'Project':
      return ROOT_KEYS.implMig;
    case 'Principle':
    case 'Requirement':
      return ROOT_KEYS.governance;
    default:
      return null;
  }
};

const BUSINESS_UNIT_ENTERPRISE_PLACEHOLDER_KEY = 'explorer:business:enterprises:root-placeholder';

const normalizeId = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

// GLOBAL RULE: Roadmaps describe change over time. Roadmaps never modify architecture truth. Truth is modified only in the active repository workspace.
const PLANNING_READONLY_MESSAGE = '';

const isSoftDeleted = (attributes: Record<string, unknown> | null | undefined) => Boolean((attributes as any)?._deleted === true);

const nameForObject = (obj: { id: string; attributes?: Record<string, unknown> }) => {
  const raw = (obj.attributes as any)?.name;
  const name = typeof raw === 'string' ? raw.trim() : '';
  return name || obj.id;
};

const titleForObjectType = (type: ObjectType): string => {
  switch (type) {
    case 'Enterprise':
      return 'Enterprise';
    case 'Capability':
      return 'Capability';
    case 'BusinessService':
      return 'Business Service';
    case 'BusinessProcess':
      return 'Business Process';
    case 'Department':
      return 'Department';
    case 'Application':
      return 'Application';
    case 'ApplicationService':
      return 'Application Service';
    case 'Technology':
      return 'Technology';
    case 'Programme':
      return 'Programme';
    case 'Project':
      return 'Project';
    case 'Principle':
      return 'Principle';
    case 'Requirement':
      return 'Requirement';
    default:
      return String(type);
  }
};

const defaultIdPrefixForType = (type: ObjectType) => {
  switch (type) {
    case 'Enterprise':
      return 'ent-';
    case 'Application':
      return 'app-';
    case 'ApplicationService':
      return 'appsvc-';
    case 'Technology':
      return 'tech-';
    case 'Programme':
      return 'prog-';
    case 'Project':
      return 'proj-';
    case 'Capability':
      return 'cap-';
    case 'BusinessService':
      return 'bizsvc-';
    case 'BusinessProcess':
      return 'proc-';
    case 'Department':
      return 'dept-';
    case 'Principle':
      return 'principle-';
    case 'Requirement':
      return 'req-';
    default:
      return `${String(type).toLowerCase()}-`;
  }
};

/** Generate a UUID using crypto.randomUUID with fallback */
const generateUUID = (): string => {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // Fallback below
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

/** Generate a unique element ID with type prefix and UUID */
const generateElementId = (type: ObjectType): string => {
  const prefix = defaultIdPrefixForType(type);
  const uuid = generateUUID();
  return `${prefix}${uuid}`;
};

const objectLeaves = (args: {
  objectsById: Map<string, { id: string; type: ObjectType; attributes: Record<string, unknown> }>;
  type: ObjectType;
  icon: React.ReactNode;
}): DataNode[] => {
  const { objectsById, type, icon } = args;
  const items = Array.from(objectsById.values()).filter((o) => o.type === type && !isSoftDeleted(o.attributes));
  items.sort((a, b) => nameForObject(a).localeCompare(nameForObject(b)) || a.id.localeCompare(b.id));
  return items.map((o) => ({
    key: KEY.element(o.id),
    title: nameForObject(o),
    icon,
    isLeaf: true,
    data: { elementId: o.id, elementType: o.type },
  }));
};

type RelationshipRecord = { fromId: string; toId: string; type: RelationshipType };

const HIERARCHY_RELATIONSHIP_TYPES: readonly RelationshipType[] = ['OWNS', 'HAS', 'DECOMPOSES_TO', 'COMPOSED_OF', 'SUPPORTED_BY'];

const relationshipHierarchy = (args: {
  objectsById: Map<string, { id: string; type: ObjectType; attributes: Record<string, unknown> }>;
  relationships: RelationshipRecord[];
  allowedTypes: readonly ObjectType[];
  allowedRelationshipTypes: readonly RelationshipType[];
  iconForType: (t: ObjectType) => React.ReactNode;
  keySuffix?: string;
}): DataNode[] => {
  const { objectsById, relationships, allowedTypes, allowedRelationshipTypes, iconForType, keySuffix } = args;

  const elementKey = (id: string) => (keySuffix ? `${KEY.element(id)}:${keySuffix}` : KEY.element(id));

  const nodes = Array.from(objectsById.values()).filter(
    (o) => allowedTypes.includes(o.type) && !isSoftDeleted(o.attributes),
  );
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const edges: Array<{ parent: string; child: string }> = [];
  const filteredRels = relationships
    .filter((r) => allowedRelationshipTypes.includes(r.type as RelationshipType) && byId.has(r.fromId) && byId.has(r.toId))
    .sort((a, b) => a.fromId.localeCompare(b.fromId) || a.toId.localeCompare(b.toId));

  filteredRels.forEach((r) => {
    if (r.fromId === r.toId) return;
    edges.push({ parent: r.fromId, child: r.toId });
  });

  const parentFor = new Map<string, string>();
  const childrenFor = new Map<string, string[]>();

  const attach = (parentId: string, childId: string) => {
    if (parentId === childId) return;
    if (parentFor.has(childId)) return;
    parentFor.set(childId, parentId);
    if (!childrenFor.has(parentId)) childrenFor.set(parentId, []);
    childrenFor.get(parentId)!.push(childId);
  };

  edges.forEach((e) => attach(e.parent, e.child));

  const dataNodes = new Map<string, DataNode>();
  nodes.forEach((n) => {
    dataNodes.set(n.id, {
      key: elementKey(n.id),
      title: nameForObject(n),
      icon: iconForType(n.type),
      isLeaf: true,
      data: { elementId: n.id, elementType: n.type },
      children: [],
    });
  });

  childrenFor.forEach((childrenIds, parentId) => {
    const parentNode = dataNodes.get(parentId);
    if (!parentNode) return;
    parentNode.isLeaf = false;
    parentNode.children = childrenIds
      .map((cid) => dataNodes.get(cid))
      .filter((c): c is DataNode => Boolean(c))
      .sort((a, b) => String(a.title).localeCompare(String(b.title)));
  });

  const roots: DataNode[] = [];
  dataNodes.forEach((node, id) => {
    const parentId = parentFor.get(id);
    if (!parentId || !dataNodes.has(parentId)) {
      roots.push(node);
    }
  });

  roots.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  return roots;
};

const capabilityHierarchy = (args: {
  objectsById: Map<string, { id: string; type: ObjectType; attributes: Record<string, unknown> }>;
  relationships: RelationshipRecord[];
  icon: React.ReactNode;
}): DataNode[] => {
  const { objectsById, relationships, icon } = args;
  return relationshipHierarchy({
    objectsById,
    relationships,
    allowedTypes: ['Capability', 'CapabilityCategory', 'SubCapability'],
    allowedRelationshipTypes: ['DECOMPOSES_TO', 'COMPOSED_OF'],
    iconForType: () => icon,
    keySuffix: 'capability-hierarchy',
  });
};

const enterpriseHierarchy = (args: {
  objectsById: Map<string, { id: string; type: ObjectType; attributes: Record<string, unknown> }>;
  relationships: RelationshipRecord[];
  enterpriseIcon: React.ReactNode;
  departmentIcon: React.ReactNode;
}): DataNode[] => {
  const { objectsById, relationships, enterpriseIcon, departmentIcon } = args;
  return relationshipHierarchy({
    objectsById,
    relationships,
    allowedTypes: ['Enterprise', 'Department'],
    allowedRelationshipTypes: ['OWNS', 'HAS'],
    iconForType: (t) => (t === 'Department' ? departmentIcon : enterpriseIcon),
    keySuffix: 'enterprise-departments',
  });
};

const enterpriseCapabilityHierarchy = (args: {
  objectsById: Map<string, { id: string; type: ObjectType; attributes: Record<string, unknown> }>;
  relationships: RelationshipRecord[];
  enterpriseIcon: React.ReactNode;
  capabilityIcon: React.ReactNode;
}): DataNode[] => {
  const { objectsById, relationships, enterpriseIcon, capabilityIcon } = args;
  return relationshipHierarchy({
    objectsById,
    relationships,
    allowedTypes: ['Enterprise', 'Capability', 'CapabilityCategory', 'SubCapability'],
    allowedRelationshipTypes: ['OWNS', 'DECOMPOSES_TO', 'COMPOSED_OF'],
    iconForType: (t) => (t === 'Enterprise' ? enterpriseIcon : capabilityIcon),
    keySuffix: 'enterprise-capabilities',
  });
};

const programmeHierarchy = (args: {
  objectsById: Map<string, { id: string; type: ObjectType; attributes: Record<string, unknown> }>;
  relationships: RelationshipRecord[];
  programmeIcon: React.ReactNode;
  projectIcon: React.ReactNode;
}): DataNode[] => {
  const { objectsById, relationships, programmeIcon, projectIcon } = args;
  return relationshipHierarchy({
    objectsById,
    relationships,
    allowedTypes: ['Programme', 'Project'],
    allowedRelationshipTypes: ['DELIVERS', 'IMPLEMENTS', 'OWNS'],
    iconForType: (t) => (t === 'Project' ? projectIcon : programmeIcon),
    keySuffix: 'programme-hierarchy',
  });
};

const applicationsByCapabilityGrouping = (args: {
  objectsById: Map<string, { id: string; type: ObjectType; attributes: Record<string, unknown> }>;
  relationships: RelationshipRecord[];
  capabilityIcon: React.ReactNode;
  applicationIcon: React.ReactNode;
}): DataNode[] => {
  const { objectsById, relationships, capabilityIcon, applicationIcon } = args;
  const capabilities = Array.from(objectsById.values()).filter(
    (o) => (o.type === 'Capability' || o.type === 'CapabilityCategory' || o.type === 'SubCapability') && !isSoftDeleted(o.attributes),
  );
  const apps = Array.from(objectsById.values()).filter((o) => o.type === 'Application' && !isSoftDeleted(o.attributes));

  const capsById = new Map(capabilities.map((c) => [c.id, c]));
  const appsById = new Map(apps.map((a) => [a.id, a]));

  const childrenByCap = new Map<string, DataNode[]>();
  const attachedAppIds = new Set<string>();

  const makeAppNode = (app: typeof apps[number]): DataNode => ({
    key: KEY.element(app.id),
    title: nameForObject(app),
    icon: applicationIcon,
    isLeaf: true,
    data: { elementId: app.id, elementType: app.type },
  });

  relationships
    .filter((r) => r.type === 'SUPPORTED_BY' && capsById.has(r.fromId) && appsById.has(r.toId))
    .forEach((r) => {
      const app = appsById.get(r.toId)!;
      attachedAppIds.add(app.id);
      if (!childrenByCap.has(r.fromId)) childrenByCap.set(r.fromId, []);
      childrenByCap.get(r.fromId)!.push(makeAppNode(app));
    });

  const grouped: DataNode[] = [];

  childrenByCap.forEach((children, capId) => {
    const cap = capsById.get(capId);
    if (!cap) return;
    children.sort((a, b) => String(a.title).localeCompare(String(b.title)) || String(a.key).localeCompare(String(b.key)));
    grouped.push({
      key: KEY.element(capId),
      title: nameForObject(cap),
      icon: capabilityIcon,
      isLeaf: false,
      data: { elementId: cap.id, elementType: cap.type },
      children,
    });
  });

  grouped.sort((a, b) => String(a.title).localeCompare(String(b.title)) || String(a.key).localeCompare(String(b.key)));

  const ungrouped = apps
    .filter((a) => !attachedAppIds.has(a.id))
    .map(makeAppNode)
    .sort((a, b) => String(a.title).localeCompare(String(b.title)) || String(a.key).localeCompare(String(b.key)));

  if (ungrouped.length > 0) {
    grouped.push({
      key: 'explorer:application:ungrouped',
      title: 'Ungrouped Applications',
      icon: applicationIcon,
      isLeaf: false,
      selectable: false,
      children: ungrouped,
    });
  }

  return grouped;
};

const applicationsByLifecycleGrouping = (args: {
  objectsById: Map<string, { id: string; type: ObjectType; attributes: Record<string, unknown> }>;
  applicationIcon: React.ReactNode;
}): DataNode[] => {
  const { objectsById, applicationIcon } = args;
  const apps = Array.from(objectsById.values()).filter((o) => o.type === 'Application' && !isSoftDeleted(o.attributes));

  const groups = new Map<string, DataNode[]>();
  const normalize = (v: unknown) => {
    const t = typeof v === 'string' ? v.trim() : '';
    return t || 'Unspecified';
  };

  const makeAppNode = (app: typeof apps[number]): DataNode => ({
    key: KEY.element(app.id),
    title: nameForObject(app),
    icon: applicationIcon,
    isLeaf: true,
    data: { elementId: app.id, elementType: app.type },
  });

  apps.forEach((app) => {
    const lifecycle = normalize((app.attributes as any)?.lifecycleState);
    if (!groups.has(lifecycle)) groups.set(lifecycle, []);
    groups.get(lifecycle)!.push(makeAppNode(app));
  });

  const nodes: DataNode[] = [];
  groups.forEach((children, lifecycle) => {
    children.sort((a, b) => String(a.title).localeCompare(String(b.title)) || String(a.key).localeCompare(String(b.key)));
    nodes.push({
      key: `explorer:application:lifecycle:${lifecycle}`,
      title: lifecycle,
      icon: applicationIcon,
      isLeaf: false,
      selectable: false,
      children,
    });
  });

  nodes.sort((a, b) => String(a.title).localeCompare(String(b.title)) || String(a.key).localeCompare(String(b.key)));
  return nodes;
};

const technologiesByLayerGrouping = (args: {
  objectsById: Map<string, { id: string; type: ObjectType; attributes: Record<string, unknown> }>;
  technologyIcon: React.ReactNode;
}): DataNode[] => {
  const { objectsById, technologyIcon } = args;
  const techs = Array.from(objectsById.values()).filter((o) => o.type === 'Technology' && !isSoftDeleted(o.attributes));

  const normalizeLayer = (attrs: Record<string, unknown> | undefined | null): string => {
    const raw =
      (attrs as any)?.technologyType ||
      (attrs as any)?.technologyCategory ||
      (attrs as any)?.category ||
      (attrs as any)?.layer;
    const val = typeof raw === 'string' ? raw.trim() : '';
    if (!val) return 'Unspecified';
    const upper = val.toLowerCase();
    if (upper.includes('infra')) return 'Infrastructure';
    if (upper.includes('platform')) return 'Platform';
    if (upper.includes('runtime')) return 'Runtime';
    return val;
  };

  const byLayer = new Map<string, DataNode[]>();

  const makeTechNode = (t: typeof techs[number]): DataNode => ({
    key: KEY.element(t.id),
    title: nameForObject(t),
    icon: technologyIcon,
    isLeaf: true,
    data: { elementId: t.id, elementType: t.type },
  });

  techs.forEach((t) => {
    const layer = normalizeLayer(t.attributes);
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(makeTechNode(t));
  });

  const nodes: DataNode[] = [];
  byLayer.forEach((children, layer) => {
    children.sort((a, b) => String(a.title).localeCompare(String(b.title)) || String(a.key).localeCompare(String(b.key)));
    nodes.push({
      key: `explorer:technology:layer:${layer}`,
      title: layer,
      icon: technologyIcon,
      isLeaf: false,
      selectable: false,
      children,
    });
  });

  nodes.sort((a, b) => String(a.title).localeCompare(String(b.title)) || String(a.key).localeCompare(String(b.key)));
  return nodes;
};

const countLiveObjectsByType = (
  objectsById: Map<string, { id: string; type: ObjectType; attributes: Record<string, unknown> }>,
  type: ObjectType,
): number => {
  let count = 0;
  for (const o of objectsById.values()) {
    if (o.type !== type) continue;
    if (isSoftDeleted(o.attributes)) continue;
    count += 1;
  }
  return count;
};

const viewsByCategory = (views: ViewDefinition[]) => {
  const business = views.filter((v) => v.architectureLayer === 'Business');
  const application = views.filter((v) => v.architectureLayer === 'Application');
  const technology = views.filter((v) => v.architectureLayer === 'Technology');
  // Roadmaps are handled via dedicated roadmap nodes, not the view repository.
  return { business, application, technology };
};

const inferHierarchyRelationshipType = (parentType: ObjectType | undefined, childType: ObjectType | undefined): RelationshipType | null => {
  if (!parentType || !childType) return null;
  for (const relType of HIERARCHY_RELATIONSHIP_TYPES) {
    const def = RELATIONSHIP_TYPE_DEFINITIONS[relType];
    if (!def) continue;
    const pairs = def.allowedEndpointPairs;
    if (pairs && pairs.length > 0) {
      if (pairs.some((p) => p.from === parentType && p.to === childType)) return relType;
      continue;
    }
    if (def.fromTypes.includes(parentType) && def.toTypes.includes(childType)) return relType;
  }
  return null;
};

const ExplorerTree: React.FC = () => {
  const { initialState } = useModel('@@initialState');
  const { selection, setSelection, setSelectedElement, setActiveElement } = useIdeSelection();
  const { openRouteTab, openWorkspaceTab, openPropertiesPanel, hierarchyEditingEnabled } = useIdeShell();
  const { eaRepository, setEaRepository, trySetEaRepository, metadata, initializationState } = useEaRepository();
  // Force full platform access in local mode.
  const userRole: RepositoryRole = 'Owner';

  const [relationshipModalOpen, setRelationshipModalOpen] = React.useState(false);
  const [relationshipSource, setRelationshipSource] = React.useState<{ id: string; type: ObjectType; name: string } | null>(null);
  const [selectedRelationshipType, setSelectedRelationshipType] = React.useState<RelationshipType | ''>('');
  const [selectedTargetId, setSelectedTargetId] = React.useState<string>('');
  const createModalOpenRef = React.useRef(false);
  const [baselinePreview, setBaselinePreview] = React.useState<Baseline | null>(null);
  const [baselinePreviewOpen, setBaselinePreviewOpen] = React.useState(false);
  const [addToViewModalOpen, setAddToViewModalOpen] = React.useState(false);
  const [addToViewTarget, setAddToViewTarget] = React.useState<{ id: string; name: string; type: ObjectType } | null>(null);
  const [addToViewViewId, setAddToViewViewId] = React.useState<string>('');
  const [viewsRefreshToken, setViewsRefreshToken] = React.useState(0);
  const [applicationGrouping, setApplicationGrouping] = React.useState<'flat' | 'capability' | 'lifecycle'>(() => {
    try {
      const stored = localStorage.getItem('ea.applicationGrouping');
      if (stored === 'capability' || stored === 'lifecycle') return stored;
    } catch {
      // ignore storage failures
    }
    return 'flat';
  });

  const actor = initialState?.currentUser?.name || initialState?.currentUser?.userid || 'ui';

  const savedViews = React.useMemo(() => ViewStore.list().filter((v) => v.status === 'SAVED'), [viewsRefreshToken]);

  const customModelingEnabled = isCustomFrameworkModelingEnabled(
    metadata?.referenceFramework ?? null,
    metadata?.frameworkConfig ?? undefined,
  );

  const [refreshToken, setRefreshToken] = React.useState(0);
  const { openSeedSampleDataModal, isRepoEmpty, hasRepository } = useSeedSampleData();
  const [seedBannerDismissed, setSeedBannerDismissed] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem('ea.seed.banner.dismissed') === 'true';
    } catch {
      return false;
    }
  });

  const dismissSeedBanner = React.useCallback(() => {
    setSeedBannerDismissed(true);
    try {
      localStorage.setItem('ea.seed.banner.dismissed', 'true');
    } catch {
      // ignore storage failures
    }
  }, []);

  React.useEffect(() => {
    const handler = () => setViewsRefreshToken((v) => v + 1);
    window.addEventListener('ea:viewsChanged', handler);
    return () => window.removeEventListener('ea:viewsChanged', handler);
  }, []);

  React.useEffect(() => {
    if (!addToViewModalOpen) return;
    if (savedViews.length === 0) {
      setAddToViewViewId('');
      return;
    }
    if (!savedViews.some((v) => v.id === addToViewViewId)) {
      setAddToViewViewId(savedViews[0].id);
    }
  }, [addToViewModalOpen, addToViewViewId, savedViews]);

  React.useEffect(() => {
    try {
      localStorage.setItem('ea.applicationGrouping', applicationGrouping);
    } catch {
      // ignore storage failures
    }
  }, [applicationGrouping]);

  const [showTechnologyInProgrammeScope, setShowTechnologyInProgrammeScope] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem('ea.programmeScope.showTechnology') === 'true';
    } catch {
      return false;
    }
  });

  const setShowTechnologyFlag = React.useCallback((next: boolean) => {
    setShowTechnologyInProgrammeScope(next);
    try {
      localStorage.setItem('ea.programmeScope.showTechnology', next ? 'true' : 'false');
    } catch {
      // Best-effort.
    }
  }, []);

  const handleConfirmAddToView = React.useCallback(() => {
    if (!addToViewTarget) {
      setAddToViewModalOpen(false);
      return;
    }
    const view = addToViewViewId ? ViewStore.get(addToViewViewId) : null;
    if (!view) {
      message.error('Select a view to add to.');
      return;
    }

    const viewpoint = ViewpointRegistry.get(view.viewpointId);
    if (viewpoint) {
      const allowed = new Set(viewpoint.allowedElementTypes.map((t) => t.toLowerCase()));
      if (!allowed.has(addToViewTarget.type.toLowerCase())) {
        message.warning('Element type is not allowed by the view viewpoint.');
        return;
      }
    }

    const existingIds = view.scope.kind === 'ManualSelection' ? [...view.scope.elementIds] : [];
    const nextIds = Array.from(new Set([...existingIds, addToViewTarget.id]));
    const nextView: ViewInstance = {
      ...view,
      scope: {
        kind: 'ManualSelection',
        elementIds: nextIds,
      },
    };

    ViewStore.save(nextView);
    message.success(`Added ${addToViewTarget.name} to ${view.name}.`);
    setAddToViewModalOpen(false);
    setAddToViewTarget(null);
  }, [addToViewTarget, addToViewViewId]);

  const permissionGuard = React.useCallback((_: any) => false, []);

  const readOnlyLabel = React.useCallback((label: string) => label, []);

  const initializationGuard = React.useCallback((_: any) => false, []);

  const initializeEnterprise = React.useCallback(() => {
    if (permissionGuard('initializeEnterprise')) return;
    if (initializationState?.status === 'initialized') {
      message.info('Enterprise already initialized.');
      return;
    }
    if (!eaRepository) {
      message.warning('No repository loaded. Create a repository first.');
      return;
    }

    const liveEnterprises = countLiveObjectsByType(eaRepository.objects, 'Enterprise');
    if (liveEnterprises > 0) {
      message.info('Enterprise already initialized.');
      return;
    }

    const elementId = generateElementId('Enterprise');
    const createdAt = new Date().toISOString();
    let name = (metadata?.organizationName ?? '').trim() || 'Enterprise';
    let description = '';

    Modal.confirm({
      title: 'Initialize Enterprise Architecture',
      okText: 'Initialize',
      cancelText: 'Cancel',
      content: (
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>
              Enterprise Name <span style={{ color: '#ff4d4f' }}>*</span>
            </div>
            <input
              defaultValue={name}
              placeholder="Enter enterprise name"
              onChange={(e) => {
                name = e.target.value;
              }}
              style={{ width: '100%', padding: 8, border: '1px solid #d9d9d9', borderRadius: 6 }}
            />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>Description</div>
            <textarea
              defaultValue={description}
              placeholder="Enter description (optional)"
              onChange={(e) => {
                description = e.target.value;
              }}
              style={{ width: '100%', padding: 8, border: '1px solid #d9d9d9', borderRadius: 6, minHeight: 100, resize: 'vertical' }}
            />
          </div>
        </div>
      ),
      onOk: () => {
        const finalName = (name ?? '').trim();
        if (!finalName) {
          message.error('Enterprise name is required.');
          return Promise.reject();
        }

        const next = eaRepository.clone();
        const existingEnterpriseCount = countLiveObjectsByType(next.objects, 'Enterprise');
        if (existingEnterpriseCount > 0) {
          message.info('Enterprise already initialized.');
          return Promise.reject();
        }

        const res = next.addObject({
          id: elementId,
          type: 'Enterprise',
          attributes: {
            name: finalName,
            description: (description ?? '').trim(),
            elementType: 'Enterprise',
            createdBy: actor,
            createdAt,
            lastModifiedAt: createdAt,
            lastModifiedBy: actor,
            lifecycleState: 'As-Is',
            ownerId: elementId,
            ownerType: 'Enterprise',
          },
        });
        if (!res.ok) {
          message.error(res.error);
          return Promise.reject();
        }

        const applied = trySetEaRepository(next);
        if (!applied.ok) return Promise.reject();

        setExpandedKeys((prev) => {
          const nextKeys = new Set(prev);
          nextKeys.add(ROOT_KEYS.business);
          nextKeys.add('explorer:business:enterprises');
          return Array.from(nextKeys);
        });

        message.success('Enterprise initialized. Modeling unlocked.');
        return Promise.resolve();
      },
    });
  }, [actor, eaRepository, initializationState?.status, metadata?.organizationName, permissionGuard, setExpandedKeys, trySetEaRepository]);

  const normalizeDomainId = React.useCallback((value: unknown): string | null => {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return null;
    return raw.toLowerCase();
  }, []);

  const computeTargetOptions = React.useCallback(
    (relationshipType: RelationshipType, source: { id: string; type: ObjectType }) => {
      if (!eaRepository) return [] as Array<{ value: string; label: string; type: string }>;
      const relDef = RELATIONSHIP_TYPE_DEFINITIONS[relationshipType];
      if (!relDef) return [] as Array<{ value: string; label: string; type: string }>;

      const currentDomainId = normalizeDomainId(metadata?.repositoryName);
      const sourceDomain = normalizeDomainId((eaRepository.objects.get(source.id)?.attributes as any)?.domainId) ?? currentDomainId;

      const pairs = relDef.allowedEndpointPairs;

      return Array.from(eaRepository.objects.values())
        .filter((o) => o.id !== source.id)
        .filter((o) => (o.attributes as any)?._deleted !== true)
        .filter((o) => {
          const toType = o.type as ObjectType;
          if (pairs && pairs.length > 0) return pairs.some((p) => p.from === (source.type as ObjectType) && p.to === toType);
          return relDef.toTypes.includes(toType);
        })
        .filter((o) => {
          const scope = metadata?.architectureScope ?? null;
          if (scope === 'Domain') {
            const targetDomain = normalizeDomainId((o.attributes as any)?.domainId) ?? currentDomainId;
            if (sourceDomain && targetDomain && sourceDomain !== targetDomain) return false;
          }
          if (scope === 'Business Unit' && relationshipType === 'OWNS') {
            if (source.type === 'Enterprise' && o.type === 'Enterprise') return false;
          }
          return true;
        })
        .map((o) => {
          const displayName =
            typeof o.attributes?.name === 'string' && o.attributes.name.trim() ? String(o.attributes.name) : o.id;
          return { value: o.id, label: `${displayName} · ${o.type} · ${o.id}`, type: o.type };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
    },
    [eaRepository, metadata?.architectureScope, metadata?.repositoryName, normalizeDomainId],
  );

  const [expandedKeys, setExpandedKeys] = React.useState<React.Key[]>(() => {
    if (metadata?.referenceFramework === 'Custom' && !customModelingEnabled) {
      return [ROOT_KEYS.views];
    }
    const scope = metadata?.architectureScope ?? null;
    if (scope === 'Enterprise') return [...ENTERPRISE_FULLY_EXPANDED_KEYS];
    if (scope === 'Business Unit') return [ROOT_KEYS.business, ROOT_KEYS.application, ROOT_KEYS.technology];
    if (scope === 'Domain') return [ROOT_KEYS.business, ROOT_KEYS.application];
    if (scope === 'Programme') return [ROOT_KEYS.implMig, 'explorer:implmig:programmes', 'explorer:implmig:plateaus', ROOT_KEYS.views, 'explorer:views:roadmaps'];
    return [ROOT_KEYS.business, ROOT_KEYS.application, ROOT_KEYS.technology, ROOT_KEYS.implMig, 'explorer:implmig:plateaus', ROOT_KEYS.governance, ROOT_KEYS.views];
  });

  React.useEffect(() => {
    // Recompute default expansion when creating/loading a repository.
    if (metadata?.referenceFramework === 'Custom' && !customModelingEnabled) {
      setExpandedKeys([ROOT_KEYS.views]);
      return;
    }
    const scope = metadata?.architectureScope ?? null;
    if (scope === 'Enterprise') {
      setExpandedKeys([...ENTERPRISE_FULLY_EXPANDED_KEYS]);
    } else if (scope === 'Business Unit') {
      setExpandedKeys([ROOT_KEYS.business, ROOT_KEYS.application, ROOT_KEYS.technology]);
    } else if (scope === 'Domain') {
      setExpandedKeys([ROOT_KEYS.business, ROOT_KEYS.application]);
    } else if (scope === 'Programme') {
      setExpandedKeys([ROOT_KEYS.implMig, 'explorer:implmig:programmes', 'explorer:implmig:plateaus', ROOT_KEYS.views, 'explorer:views:roadmaps']);
    } else {
      setExpandedKeys([ROOT_KEYS.business, ROOT_KEYS.application, ROOT_KEYS.technology, ROOT_KEYS.implMig, 'explorer:implmig:plateaus', ROOT_KEYS.governance, ROOT_KEYS.views]);
    }
  }, [customModelingEnabled, metadata?.architectureScope, metadata?.referenceFramework]);

  // Listen for repository/views changes to refresh the explorer tree
  React.useEffect(() => {
    const handler = () => setRefreshToken((x) => x + 1);
    try {
      window.addEventListener('ea:repositoryChanged', handler);
      window.addEventListener('ea:relationshipsChanged', handler);
      window.addEventListener('ea:viewsChanged', handler);
      return () => {
        window.removeEventListener('ea:repositoryChanged', handler);
        window.removeEventListener('ea:relationshipsChanged', handler);
        window.removeEventListener('ea:viewsChanged', handler);
      };
    } catch {
      return;
    }
  }, []);

  const views = React.useMemo<ViewDefinition[]>(() => {
    try {
      return getViewRepository().listAllViews();
    } catch {
      return [];
    }
  }, [refreshToken]);

  const [treeHeight, setTreeHeight] = React.useState<number>(520);

  React.useEffect(() => {
    const recomputeHeight = () => {
      if (typeof window === 'undefined') return;
      const proposed = window.innerHeight - 220;
      const bounded = Math.max(360, Math.min(960, proposed));
      setTreeHeight(bounded);
    };

    recomputeHeight();
    window.addEventListener('resize', recomputeHeight);
    return () => window.removeEventListener('resize', recomputeHeight);
  }, []);

  const saveRelationshipFromModal = React.useCallback(() => {
    setRelationshipModalOpen(false);
  }, []);

  const normalizeElementKey = React.useCallback((rawKey: string) => {
    const trimmed = rawKey.replace('explorer:element:', '').trim();
    const suffixIndex = trimmed.indexOf(':');
    return suffixIndex === -1 ? trimmed : trimmed.slice(0, suffixIndex);
  }, []);

  const { treeData, elementKeyIndex } = React.useMemo(() => {
    const objectsById = eaRepository?.objects ?? new Map();
    const relationships = eaRepository?.relationships ?? [];
    const viewCats = viewsByCategory(views);
    const scope = metadata?.architectureScope ?? null;
    const isCustomBlankCanvas = metadata?.referenceFramework === 'Custom' && !customModelingEnabled;
    const baselines = listBaselines();
    const plateaus = listPlateaus();
    const roadmaps = listRoadmaps();
    const isObjectTypeVisible = (type: ObjectType): boolean => {
      const framework = metadata?.referenceFramework ?? null;
      if (!framework) return true;
      if (framework === 'Custom') {
        return isObjectTypeEnabledForFramework('Custom', metadata?.frameworkConfig ?? undefined, type);
      }
      return isObjectTypeAllowedForReferenceFramework(framework, type);
    };
    const collectionNode = (args: {
      key: string;
      title: string;
      icon: React.ReactNode;
      children: DataNode[];
    }): DataNode => ({
      key: args.key,
      title: args.title,
      icon: args.icon,
      selectable: true,
      children: args.children,
    });

    const viewLeaf = (v: ViewDefinition): DataNode => ({
      key: KEY.view(v.id),
      title: v.name,
      icon: <FileTextOutlined />,
      isLeaf: true,
    });

    const baselineLeaf = (b: Baseline): DataNode => ({
      key: KEY.baseline(b.id),
      title: b.name || b.id,
      icon: <FileTextOutlined />,
      isLeaf: true,
      data: { baselineId: b.id },
    });

    const plateauLeaf = (p: Plateau): DataNode => ({
      key: KEY.plateau(p.id),
      title: p.name,
      icon: <FundProjectionScreenOutlined />,
      isLeaf: true,
      data: { plateauId: p.id },
    });

    const roadmapLeaf = (r: Roadmap): DataNode => ({
      key: KEY.roadmap(r.id),
      title: r.name,
      icon: <FundProjectionScreenOutlined />,
      isLeaf: true,
      data: { roadmapId: r.id },
    });

    const enterpriseCapabilityTree = enterpriseCapabilityHierarchy({
      objectsById,
      relationships,
      enterpriseIcon: <ApartmentOutlined />,
      capabilityIcon: <ApartmentOutlined />,
    });

    const initializeDisabled = !hasRepositoryPermission(userRole, 'initializeEnterprise');

    const enterpriseInitializationCta: DataNode = {
      key: 'explorer:business:enterprises:init-cta',
      title: (
        <div style={{ display: 'grid', gap: 8 }}>
          <Typography.Text strong style={{ margin: 0 }}>No Enterprise defined.</Typography.Text>
          <Typography.Text type="secondary" style={{ margin: 0 }}>
            Initialize the Enterprise Architecture to begin modeling.
          </Typography.Text>
          <Button
            type="primary"
            size="small"
            onClick={initializeEnterprise}
            disabled={initializeDisabled}
            title={initializeDisabled ? 'You have read-only access.' : undefined}
          >
            Initialize Enterprise
          </Button>
        </div>
      ),
      icon: <ApartmentOutlined />,
      isLeaf: true,
      selectable: false,
    };

    const enterpriseChildren: DataNode[] =
      enterpriseCapabilityTree.length > 0
        ? enterpriseCapabilityTree
        : initializationState?.status === 'uninitialized'
          ? [enterpriseInitializationCta]
          : [
              {
                key: 'explorer:business:enterprises:empty',
                title: 'No enterprises yet',
                icon: <FileTextOutlined />,
                isLeaf: true,
                selectable: false,
              },
            ];

    const businessUnitEnterpriseChildren: DataNode[] =
      enterpriseCapabilityTree.length > 0
        ? [enterpriseCapabilityTree[0]!]
        : initializationState?.status === 'uninitialized'
          ? [enterpriseInitializationCta]
          : [
              {
                key: BUSINESS_UNIT_ENTERPRISE_PLACEHOLDER_KEY,
                title: 'Business Unit (root)',
                icon: <ApartmentOutlined />,
                isLeaf: true,
              },
            ];

    const businessChildren: DataNode[] = (() => {
      if (scope === 'Domain') {
        return [
          ...(isObjectTypeVisible('Capability')
            ? [
                collectionNode({
                  key: 'explorer:business:capabilities',
                  title: 'Capabilities',
                  icon: <ApartmentOutlined />,
                  children: capabilityHierarchy({ objectsById, relationships, icon: <ApartmentOutlined /> }),
                }),
              ]
            : []),
          ...(isObjectTypeVisible('BusinessService')
            ? [
                collectionNode({
                  key: 'explorer:business:business-services',
                  title: 'Business Services',
                  icon: <ForkOutlined />,
                  children: objectLeaves({ objectsById, type: 'BusinessService', icon: <ForkOutlined /> }),
                }),
              ]
            : []),
        ];
      }

      if (scope === 'Programme') {
        return isObjectTypeVisible('Capability')
          ? [
              collectionNode({
                key: 'explorer:business:capabilities',
                title: 'Capabilities',
                icon: <ApartmentOutlined />,
                children: capabilityHierarchy({ objectsById, relationships, icon: <ApartmentOutlined /> }),
              }),
            ]
          : [];
      }

      return [
        ...(isObjectTypeVisible('Enterprise')
          ? [
              collectionNode({
                key: 'explorer:business:enterprises',
                title: 'Enterprises',
                icon: <ApartmentOutlined />,
                children: scope === 'Business Unit' ? businessUnitEnterpriseChildren : enterpriseChildren,
              }),
            ]
          : []),
        ...(isObjectTypeVisible('Capability')
          ? [
              collectionNode({
                key: 'explorer:business:capabilities',
                title: 'Capabilities',
                icon: <ApartmentOutlined />,
                children: capabilityHierarchy({ objectsById, relationships, icon: <ApartmentOutlined /> }),
              }),
            ]
          : []),
        ...(isObjectTypeVisible('BusinessService')
          ? [
              collectionNode({
                key: 'explorer:business:business-services',
                title: 'Business Services',
                icon: <ForkOutlined />,
                children: objectLeaves({ objectsById, type: 'BusinessService', icon: <ForkOutlined /> }),
              }),
            ]
          : []),
        ...(isObjectTypeVisible('BusinessProcess')
          ? [
              collectionNode({
                key: 'explorer:business:processes',
                title: 'Business Processes',
                icon: <ForkOutlined />,
                children: objectLeaves({ objectsById, type: 'BusinessProcess', icon: <ForkOutlined /> }),
              }),
            ]
          : []),
        ...(isObjectTypeVisible('Department')
          ? [
              collectionNode({
                key: 'explorer:business:departments',
                title: 'Departments',
                icon: <TeamOutlined />,
                children: enterpriseHierarchy({
                  objectsById,
                  relationships,
                  enterpriseIcon: <ApartmentOutlined />,
                  departmentIcon: <TeamOutlined />,
                }),
              }),
            ]
          : []),
      ];
    })();

    const businessRoot: DataNode = {
      key: ROOT_KEYS.business,
      title: 'Business',
      icon: <DatabaseOutlined />,
      children: businessChildren,
    };

    const applicationCollectionChildren =
      applicationGrouping === 'capability'
        ? applicationsByCapabilityGrouping({
            objectsById,
            relationships,
            capabilityIcon: <ApartmentOutlined />,
            applicationIcon: <AppstoreOutlined />,
          })
        : applicationGrouping === 'lifecycle'
          ? applicationsByLifecycleGrouping({ objectsById, applicationIcon: <AppstoreOutlined /> })
          : objectLeaves({ objectsById, type: 'Application', icon: <AppstoreOutlined /> });

    const applicationChildren: DataNode[] = [
      ...(isObjectTypeVisible('Application')
        ? [
            collectionNode({
              key: 'explorer:application:applications',
              title: 'Applications',
              icon: <AppstoreOutlined />,
              children: applicationCollectionChildren,
            }),
          ]
        : []),
      ...((scope === 'Programme') || !isObjectTypeVisible('ApplicationService')
        ? []
        : [
            collectionNode({
              key: 'explorer:application:application-services',
              title: 'Application Services',
              icon: <AppstoreOutlined />,
              children: objectLeaves({ objectsById, type: 'ApplicationService', icon: <AppstoreOutlined /> }),
            }),
          ]),
    ];

    const applicationRoot: DataNode = {
      key: ROOT_KEYS.application,
      title: 'Application',
      icon: <DatabaseOutlined />,
      children: applicationChildren,
    };

    const technologyChildren: DataNode[] = isObjectTypeVisible('Technology')
      ? [
          collectionNode({
            key: 'explorer:technology:technologies',
            title: 'Technologies',
            icon: <CloudOutlined />,
            children: technologiesByLayerGrouping({ objectsById, technologyIcon: <CloudOutlined /> }),
          }),
        ]
      : [];

    const technologyRoot: DataNode = {
      key: ROOT_KEYS.technology,
      title: 'Technology',
      icon: <DatabaseOutlined />,
      children: technologyChildren,
    };

    const viewsRoot: DataNode = {
      key: ROOT_KEYS.views,
      title: 'Views',
      icon: <ApartmentOutlined />,
      children: [
        {
          key: 'explorer:views:business',
          title: 'Business Views',
          icon: <ApartmentOutlined />,
          children: viewCats.business.map(viewLeaf),
        },
        {
          key: 'explorer:views:application',
          title: 'Application Views',
          icon: <ApartmentOutlined />,
          children: viewCats.application.map(viewLeaf),
        },
        {
          key: 'explorer:views:technology',
          title: 'Technology Views',
          icon: <ApartmentOutlined />,
          children: viewCats.technology.map(viewLeaf),
        },
        {
          key: 'explorer:views:saved',
          title: 'Saved Views',
          icon: <ApartmentOutlined />,
          children:
            savedViews.length === 0
              ? [
                  {
                    key: 'explorer:views:saved:empty',
                    title: 'No saved views yet',
                    icon: <FileTextOutlined />,
                    isLeaf: true,
                    selectable: false,
                  },
                ]
              : savedViews.map((v) => ({
                  key: `explorer:views:saved:${v.id}`,
                  title: v.name,
                  icon: <FileTextOutlined />,
                  isLeaf: true,
                })),
        },
        {
          key: 'explorer:views:roadmaps',
          title: 'Roadmaps',
          icon: <ApartmentOutlined />,
          children:
            roadmaps.length === 0
              ? [
                  {
                    key: 'explorer:views:roadmaps:empty',
                    title: 'No roadmaps yet',
                    icon: <FileTextOutlined />,
                    isLeaf: true,
                    selectable: false,
                  },
                ]
              : roadmaps.map(roadmapLeaf),
        },
      ],
    };

    const tree: DataNode[] = (() => {
      if (isCustomBlankCanvas) {
        return [
        {
          key: 'explorer:blank-canvas',
          title: 'Blank canvas (Custom)',
          icon: <DatabaseOutlined />,
          selectable: true,
          children: [
            {
              key: 'explorer:blank-canvas:hint',
              title: 'Define at least one element type in Metamodel to enable modeling',
              icon: <ProjectOutlined />,
              isLeaf: true,
            },
          ],
        },
        viewsRoot,
        ];
      }

      if (scope === 'Business Unit') {
        return [businessRoot, applicationRoot, technologyRoot].filter((n) => n.children.length > 0);
      }

      if (scope === 'Domain') {
        return [businessRoot, applicationRoot].filter((n) => n.children.length > 0);
      }

      if (scope === 'Programme') {
        const implMigRoot: DataNode = {
          key: ROOT_KEYS.implMig,
          title: 'Implementation & Migration',
          icon: <DatabaseOutlined />,
          children: [
            collectionNode({
              key: 'explorer:implmig:programmes',
              title: 'Programmes',
              icon: <ProjectOutlined />,
              children: programmeHierarchy({
                objectsById,
                relationships,
                programmeIcon: <ProjectOutlined />,
                projectIcon: <FundProjectionScreenOutlined />,
              }),
            }),
            collectionNode({
              key: 'explorer:implmig:plateaus',
              title: 'Plateaus',
              icon: <FundProjectionScreenOutlined />,
              children: plateaus.length === 0 ? [
                {
                  key: 'explorer:implmig:plateaus:empty',
                  title: 'No plateaus yet',
                  icon: <FileTextOutlined />,
                  isLeaf: true,
                  selectable: false,
                },
              ] : plateaus.map(plateauLeaf),
            }),
          ],
        };

        const programmeViewsRoot: DataNode = {
          key: ROOT_KEYS.views,
          title: 'Views',
          icon: <ApartmentOutlined />,
          children: [
            {
              key: 'explorer:views:roadmaps',
              title: 'Roadmaps',
              icon: <ApartmentOutlined />,
              children:
                roadmaps.length === 0
                  ? [
                      {
                        key: 'explorer:views:roadmaps:empty',
                        title: 'No roadmaps yet',
                        icon: <FileTextOutlined />,
                        isLeaf: true,
                        selectable: false,
                      },
                    ]
                  : roadmaps.map(roadmapLeaf),
            },
            {
              key: 'explorer:views:application',
              title: 'Application Views',
              icon: <ApartmentOutlined />,
              children: viewCats.application.map(viewLeaf),
            },
            {
              key: 'explorer:views:business',
              title: 'Business Views',
              icon: <ApartmentOutlined />,
              children: viewCats.business.map(viewLeaf),
            },
          ],
        };

        return [
          implMigRoot,
          programmeViewsRoot,
          ...[applicationRoot, businessRoot, ...(showTechnologyInProgrammeScope ? [technologyRoot] : [])].filter(
            (n) => n.children.length > 0,
          ),
        ];
      }

      return [
        ...[businessRoot, applicationRoot, technologyRoot].filter((n) => n.children.length > 0),
        {
          key: ROOT_KEYS.implMig,
          title: 'Implementation & Migration',
          icon: <DatabaseOutlined />,
          children: [
            collectionNode({
              key: 'explorer:implmig:programmes',
              title: 'Programmes',
              icon: <ProjectOutlined />,
              children: programmeHierarchy({
                objectsById,
                relationships,
                programmeIcon: <ProjectOutlined />,
                projectIcon: <FundProjectionScreenOutlined />,
              }),
            }),
            collectionNode({
              key: 'explorer:implmig:plateaus',
              title: 'Plateaus',
              icon: <FundProjectionScreenOutlined />,
              children:
                plateaus.length === 0
                  ? [
                      {
                        key: 'explorer:implmig:plateaus:empty',
                        title: 'No plateaus yet',
                        icon: <FileTextOutlined />,
                        isLeaf: true,
                        selectable: false,
                      },
                    ]
                  : plateaus.map(plateauLeaf),
            }),
          ],
        },
        {
          key: ROOT_KEYS.governance,
          title: 'Governance',
          icon: <DatabaseOutlined />,
          children: [
            collectionNode({
              key: 'explorer:governance:principles',
              title: 'Principles',
              icon: <SafetyOutlined />,
              children: objectLeaves({ objectsById, type: 'Principle', icon: <SafetyOutlined /> }),
            }),
            collectionNode({
              key: 'explorer:governance:requirements',
              title: 'Requirements',
              icon: <FileTextOutlined />,
              children: objectLeaves({ objectsById, type: 'Requirement', icon: <FileTextOutlined /> }),
            }),
          ],
        },
        viewsRoot,
        {
          key: ROOT_KEYS.baselines,
          title: 'Baselines',
          icon: <SafetyOutlined />,
          children:
            baselines.length === 0
              ? [
                  {
                    key: 'explorer:baselines:empty',
                    title: 'No baselines yet',
                    icon: <FileTextOutlined />,
                    isLeaf: true,
                    selectable: false,
                  },
                ]
              : baselines.map(baselineLeaf),
        },
      ];
    })();

    const index = new Map<string, string>();
    const walk = (nodes: DataNode[]) => {
      nodes.forEach((node) => {
        const data = (node as any)?.data as { elementId?: string } | undefined;
        if (data?.elementId && typeof node.key === 'string' && !index.has(data.elementId)) {
          index.set(data.elementId, node.key);
        }
        if (node.children) walk(node.children);
      });
    };
    walk(tree);

    return { treeData: tree, elementKeyIndex: index } as const;
  }, [applicationGrouping, customModelingEnabled, eaRepository, initializationState?.status, initializeEnterprise, metadata?.architectureScope, metadata?.referenceFramework, refreshToken, showTechnologyInProgrammeScope, userRole, views]);

  const selectedKeysFromContext = React.useMemo(() => {
    const key = selection?.keys?.[0];
    if (!key) return [] as React.Key[];
    if (typeof key === 'string' && key.startsWith('explorer:element:')) {
      const id = normalizeElementKey(key);
      const mapped = elementKeyIndex.get(id);
      if (mapped) return [mapped];
      return [key];
    }
    if (typeof key === 'string' && key.startsWith('explorer:')) return [key];
    if (typeof key === 'string') {
      const mapped = elementKeyIndex.get(key);
      return [mapped ?? KEY.element(key)];
    }
    return [] as React.Key[];
  }, [elementKeyIndex, normalizeElementKey, selection?.keys]);

  const parentByKey = React.useMemo(() => {
    const map = new Map<string, string | null>();

    const walk = (nodes: DataNode[], parent: string | null) => {
      nodes.forEach((node) => {
        if (typeof node.key === 'string') {
          map.set(node.key, parent);
          if (node.children) walk(node.children, node.key);
        }
      });
    };

    walk(treeData, null);
    return map;
  }, [treeData]);

  const activePathAncestors = React.useMemo(() => {
    const selected = selectedKeysFromContext[0];
    if (typeof selected !== 'string') return new Set<string>();

    const ancestors = new Set<string>();
    let cursor: string | null = selected;
    while (cursor) {
      const parent = parentByKey.get(cursor) ?? null;
      if (!parent) break;
      ancestors.add(parent);
      cursor = parent;
    }

    return ancestors;
  }, [parentByKey, selectedKeysFromContext]);

  const handleDrop: TreeProps['onDrop'] = React.useCallback(
    (info) => {
      if (!eaRepository) return;
      if (!hierarchyEditingEnabled) return;
      if (info.dropToGap) return;

      const targetKey = typeof info.node?.key === 'string' ? info.node.key : '';
      const dragKey = typeof info.dragNode?.key === 'string' ? info.dragNode.key : '';
      if (!targetKey.startsWith('explorer:element:') || !dragKey.startsWith('explorer:element:')) return;

      // Prevent cycles: do not allow dropping into a descendant of the dragged node.
      let cursor: string | null = targetKey;
      while (cursor) {
        if (cursor === dragKey) return;
        cursor = parentByKey.get(cursor) ?? null;
      }

      const parentData = (info.node as any)?.data as { elementId?: string; elementType?: ObjectType };
      const childData = (info.dragNode as any)?.data as { elementId?: string; elementType?: ObjectType };
      if (!parentData?.elementId || !parentData?.elementType) return;
      if (!childData?.elementId || !childData?.elementType) return;
      if (parentData.elementId === childData.elementId) return;

      const relationshipType = inferHierarchyRelationshipType(parentData.elementType, childData.elementType);
      if (!relationshipType) return; // Invalid endpoint pair for hierarchy changes → silent no-op.

      const existingHierarchyRels = eaRepository.relationships.filter((r) => r.toId === childData.elementId);
      const alreadyLinked = existingHierarchyRels.some(
        (r) =>
          (HIERARCHY_RELATIONSHIP_TYPES as readonly RelationshipType[]).includes(r.type as RelationshipType) &&
          r.fromId === parentData.elementId &&
          r.type === relationshipType,
      );
      if (alreadyLinked) return; // Nothing to change.

      if (permissionGuard('createRelationship')) return;

      const parentObj = eaRepository.objects.get(parentData.elementId);
      const childObj = eaRepository.objects.get(childData.elementId);
      const parentLabel = parentObj ? nameForObject(parentObj) : parentData.elementId;
      const childLabel = childObj ? nameForObject(childObj) : childData.elementId;

      Modal.confirm({
        title: 'Change hierarchy?',
        okText: 'Apply',
        cancelText: 'Cancel',
        content: (
          <div style={{ display: 'grid', gap: 4 }}>
            <span>
              Create {relationshipType} from <strong>{parentLabel}</strong> to <strong>{childLabel}</strong>.
            </span>
            <Typography.Text type="secondary">
              Existing hierarchy links to {childLabel} will be removed first.
            </Typography.Text>
          </div>
        ),
        onOk: () => {
          const next = eaRepository.clone();

          next.relationships = next.relationships.filter((r) => {
            const relType = r.type as RelationshipType;
            if (!(HIERARCHY_RELATIONSHIP_TYPES as readonly RelationshipType[]).includes(relType)) return true;
            return r.toId !== childData.elementId;
          });

          const addRes = next.addRelationship({
            fromId: parentData.elementId,
            toId: childData.elementId,
            type: relationshipType,
            attributes: { createdBy: actor },
          });
          if (!addRes.ok) {
            message.error(addRes.error);
            return Promise.reject();
          }

          const applied = trySetEaRepository(next);
          if (!applied.ok) return Promise.reject();

          message.success('Hierarchy updated.');
          try {
            window.dispatchEvent(new Event('ea:repositoryChanged'));
            window.dispatchEvent(new Event('ea:relationshipsChanged'));
          } catch {
            // Best-effort only.
          }
          return Promise.resolve();
        },
      });
    },
    [actor, eaRepository, parentByKey, permissionGuard, trySetEaRepository],
  );

  const createObject = React.useCallback(
    (type: ObjectType) => {
      if (permissionGuard('createElement')) return;
      if (!eaRepository) {
        message.warning('No repository loaded. Create a repository first.');
        return;
      }

      if (metadata?.referenceFramework === 'Custom') {
        if (!customModelingEnabled) {
          message.warning('Custom framework: define at least one element type in Metamodel to enable modeling.');
          return;
        }
        if (!isObjectTypeEnabledForFramework('Custom', metadata?.frameworkConfig ?? undefined, type)) {
          message.warning(`Custom framework: element type "${type}" is not enabled.`);
          return;
        }
      }

      if (metadata?.architectureScope === 'Programme') {
        const programmeCount = countLiveObjectsByType(eaRepository.objects, 'Programme');
        if (programmeCount < 1 && type !== 'Programme') {
          message.warning('Create at least one Programme before creating other elements.');
          return;
        }
        const allowed: ReadonlySet<ObjectType> = new Set(['Programme', 'Project', 'Capability', 'Application']);
        if (!allowed.has(type)) {
          message.warning('Programme scope is focused: only Programmes, Projects, Capabilities, and Applications can be created.');
          return;
        }
      }

      if (metadata?.architectureScope === 'Domain') {
        const allowed: ReadonlySet<ObjectType> = new Set([
          'Capability',
          'BusinessService',
          'Application',
          'ApplicationService',
        ]);
        if (!allowed.has(type)) {
          message.warning(
            'Domain scope is focused: only Capabilities, Business Services, Applications, and Application Services can be created.',
          );
          return;
        }
      }

      if (metadata?.architectureScope === 'Business Unit' && type === 'Enterprise') {
        const liveEnterprises = countLiveObjectsByType(eaRepository.objects, 'Enterprise');
        if (liveEnterprises >= 1) {
          message.warning('Business Unit scope allows exactly one Enterprise root.');
          return;
        }
      }

      // Generate UUID-based element ID
      const elementId = generateElementId(type);
      const createdAt = new Date().toISOString();

      let name = '';
      let description = '';
      let ownerId = '';

      const isStrictGovernance = metadata?.governanceMode === 'Strict';
      if (isStrictGovernance && (type === 'Enterprise' || type === 'Department')) {
        // Allow bootstrap in Strict mode by defaulting to self-ownership for owner types.
        ownerId = elementId;
      }

      const ownerCandidates = Array.from(eaRepository.objects.values())
        .filter((o) => !isSoftDeleted(o.attributes) && (o.type === 'Enterprise' || o.type === 'Department'))
        .map((o) => ({ id: o.id, type: o.type, title: nameForObject(o) }))
        .sort((a, b) => (a.type + a.title + a.id).localeCompare(b.type + b.title + b.id));

      const ownerOptions: Array<{ label: string; options: Array<{ value: string; label: string }> }> = [
        ...(isStrictGovernance && (type === 'Enterprise' || type === 'Department')
          ? [
              {
                label: 'Self',
                options: [{ value: elementId, label: `Self (${elementId})` }],
              },
            ]
          : []),
        {
          label: 'Enterprise',
          options: ownerCandidates
            .filter((o) => o.type === 'Enterprise')
            .map((o) => ({ value: o.id, label: `${o.title} (${o.id})` })),
        },
        {
          label: 'Department',
          options: ownerCandidates
            .filter((o) => o.type === 'Department')
            .map((o) => ({ value: o.id, label: `${o.title} (${o.id})` })),
        },
      ].filter((g) => g.options.length > 0);

      if (createModalOpenRef.current) return;
      createModalOpenRef.current = true;

      Modal.confirm({
        title: `Create ${titleForObjectType(type)}`,
        okText: 'Create',
        cancelText: 'Cancel',
        maskStyle: { backdropFilter: 'none', backgroundColor: 'rgba(0, 0, 0, 0.45)' },
        afterClose: () => {
          createModalOpenRef.current = false;
        },
        content: (
          <Form layout="vertical">
            <Form.Item label="Name" required>
              <Input
                defaultValue={name}
                placeholder="Enter name"
                onChange={(e) => {
                  name = e.target.value;
                }}
              />
            </Form.Item>
            <Form.Item label="Description">
              <Input.TextArea
                defaultValue={description}
                placeholder="Enter description (optional)"
                autoSize={{ minRows: 3, maxRows: 6 }}
                onChange={(e) => {
                  description = e.target.value;
                }}
              />
            </Form.Item>
            {isStrictGovernance ? (
              <Form.Item label="Owner" required>
                <Select
                  placeholder="Select owner"
                  showSearch
                  optionFilterProp="label"
                  options={ownerOptions}
                  value={ownerId || undefined}
                  onChange={(v) => {
                    ownerId = String(v);
                  }}
                />
              </Form.Item>
            ) : null}
          </Form>
        ),
        onOk: () => {
          const finalName = (name ?? '').trim();
          if (!finalName) {
            message.error('Name is required.');
            return Promise.reject();
          }

          const finalOwnerId = (ownerId ?? '').trim();
          if (isStrictGovernance) {
            if (!finalOwnerId) {
              message.error('Owner is required in Strict mode.');
              return Promise.reject();
            }
            if ((type !== 'Enterprise' && type !== 'Department') || finalOwnerId !== elementId) {
              const owner = eaRepository.objects.get(finalOwnerId);
              if (!owner || isSoftDeleted(owner.attributes) || (owner.type !== 'Enterprise' && owner.type !== 'Department')) {
                message.error('Owner must reference an existing Enterprise or Department.');
                return Promise.reject();
              }
            }
          }

          if (!eaRepository) return Promise.reject();
          const next = eaRepository.clone();
          const res = next.addObject({
            id: elementId,
            type,
            attributes: {
              name: finalName,
              description: (description ?? '').trim(),
              elementType: type,
              createdBy: actor,
              createdAt,
              lastModifiedAt: createdAt,
              lastModifiedBy: actor,
              lifecycleState: 'As-Is',
              ...(isStrictGovernance
                ? {
                    ownerId: finalOwnerId,
                    ownerType:
                      finalOwnerId === elementId
                        ? type
                        : (eaRepository.objects.get(finalOwnerId)?.type ?? undefined),
                  }
                : {}),
              ...(metadata?.architectureScope === 'Domain'
                ? { domainId: (metadata?.repositoryName ?? '').trim() || 'domain' }
                : {}),
            },
          });
          if (!res.ok) {
            message.error(res.error);
            return Promise.reject();
          }

          // Note: NO relationships are auto-created

          const applied = trySetEaRepository(next);
          if (!applied.ok) return Promise.reject();

          // Auto-expand the collection to show the newly created element
          const collectionKey = getCollectionKeyForType(type);
          const rootKey = getRootKeyForType(type);
          if (collectionKey || rootKey) {
            setExpandedKeys((prev) => {
              const next = new Set(prev);
              if (rootKey) next.add(rootKey);
              if (collectionKey) next.add(collectionKey);
              return Array.from(next);
            });
          }

          message.success(`${titleForObjectType(type)} created.`);
          setRefreshToken((x) => x + 1);
          createModalOpenRef.current = false;
          return undefined;
        },
        onCancel: () => {
          createModalOpenRef.current = false;
        },
      });
    },
    [
      actor,
      customModelingEnabled,
      eaRepository,
      initializationGuard,
      metadata?.architectureScope,
      metadata?.frameworkConfig,
      metadata?.governanceMode,
      metadata?.referenceFramework,
      permissionGuard,
      setExpandedKeys,
      setRefreshToken,
      trySetEaRepository,
    ],
  );

  const duplicateObject = React.useCallback(
    (id: string) => {
      if (permissionGuard('createElement')) return;
      if (!eaRepository) return;
      const src = eaRepository.objects.get(id);
      if (!src) return;

      if (metadata?.referenceFramework === 'Custom') {
        if (!customModelingEnabled) {
          message.warning('Custom framework: define at least one element type in Metamodel to enable modeling.');
          return;
        }
        if (!isObjectTypeEnabledForFramework('Custom', metadata?.frameworkConfig ?? undefined, src.type as any)) {
          message.warning(`Custom framework: element type "${src.type}" is not enabled.`);
          return;
        }
      }

      if (metadata?.architectureScope === 'Business Unit' && src.type === 'Enterprise') {
        message.warning('Business Unit scope allows exactly one Enterprise root.');
        return;
      }

      const next = eaRepository.clone();
      const newId = generateElementId(src.type);
      const createdAt = new Date().toISOString();
      const res = next.addObject({
        id: newId,
        type: src.type,
        attributes: {
          ...(src.attributes ?? {}),
          name: `${nameForObject(src)} (Copy)`,
          elementType: src.type,
          createdBy: actor,
          createdAt,
          lastModifiedAt: createdAt,
          lastModifiedBy: actor,
          lifecycleState: (src.attributes as any)?.lifecycleState === 'To-Be' ? 'To-Be' : 'As-Is',
        },
      });
      if (!res.ok) {
        message.error(res.error);
        return;
      }

      // Note: NO relationships are auto-created for duplicated elements

      const applied = trySetEaRepository(next);
      if (!applied.ok) return;

      setRefreshToken((x) => x + 1);
      message.success('Element duplicated.');
    },
    [
      actor,
      customModelingEnabled,
      eaRepository,
      metadata?.architectureScope,
      metadata?.frameworkConfig,
      metadata?.referenceFramework,
      permissionGuard,
      trySetEaRepository,
    ],
  );

  const deleteObject = React.useCallback(
    (id: string) => {
      if (permissionGuard('deleteElement')) return;
      if (!eaRepository) return;
      const obj = eaRepository.objects.get(id);
      if (!obj) return;

      if (metadata?.architectureScope === 'Business Unit' && obj.type === 'Enterprise') {
        message.warning('Business Unit scope requires exactly one Enterprise root; it cannot be deleted.');
        return;
      }

      Modal.confirm({
        title: 'Delete element?',
        content: `Deletes "${nameForObject(obj)}" from the repository (relationships will also be removed).`,
        okText: 'Delete',
        okButtonProps: { danger: true },
        cancelText: 'Cancel',
        onOk: () => {
          if (!eaRepository) return;
          const next = eaRepository.clone();
          // Best-effort: mark as deleted (hard delete is implemented in EaRepository next iteration).
          const res = next.updateObjectAttributes(id, { _deleted: true }, 'merge');
          if (!res.ok) {
            message.error(res.error);
            return;
          }

          const applied = trySetEaRepository(next);
          if (!applied.ok) return;

          setRefreshToken((x) => x + 1);
          message.success('Element deleted.');
        },
      });
    },
    [eaRepository, metadata?.architectureScope, permissionGuard, trySetEaRepository],
  );

  const deleteView = React.useCallback((viewId: string) => {
    if (permissionGuard('editView')) return;
    Modal.confirm({
      title: 'Delete view?',
      content: 'Deleting a diagram does not delete architecture data. Only the view definition is removed.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: () => {
        try {
          deleteViewById(viewId);
          setRefreshToken((x) => x + 1);
          message.success('View deleted.');
        } catch {
          message.error('Failed to delete view.');
        }
      },
    });
  }, [permissionGuard]);

  const openForKey = React.useCallback(
    (key: string) => {
      const scope = metadata?.architectureScope ?? null;
      // Root nodes open the most common catalog / view for that domain.
      if (key === ROOT_KEYS.business) {
        if (scope === 'Programme') {
          openWorkspaceTab({ type: 'catalog', catalog: 'capabilities' });
          return;
        }
        openWorkspaceTab({ type: 'catalog', catalog: scope === 'Domain' ? 'capabilities' : 'enterprises' });
        return;
      }
      if (key === ROOT_KEYS.application) {
        openWorkspaceTab({ type: 'catalog', catalog: 'applications' });
        return;
      }
      if (key === ROOT_KEYS.technology) {
        openWorkspaceTab({ type: 'catalog', catalog: 'technologies' });
        return;
      }
      if (key === ROOT_KEYS.implMig) {
        openWorkspaceTab({ type: 'catalog', catalog: 'programmes' });
        return;
      }
      if (key === ROOT_KEYS.governance) {
        openWorkspaceTab({ type: 'catalog', catalog: 'principles' });
        return;
      }
      if (key === ROOT_KEYS.views) {
        // Views are managed under the Diagrams activity; keep this as a no-op open.
        openRouteTab('/workspace');
        return;
      }
      if (key === ROOT_KEYS.baselines) {
        // Baselines are read-only snapshots; no navigation on root click.
        return;
      }

      // Second-level catalogs.
      if (key === 'explorer:business:enterprises') {
        openWorkspaceTab({ type: 'catalog', catalog: 'enterprises' });
        return;
      }
      if (key === BUSINESS_UNIT_ENTERPRISE_PLACEHOLDER_KEY) {
        openWorkspaceTab({ type: 'catalog', catalog: 'enterprises' });
        return;
      }
      if (key === 'explorer:business:capabilities') {
        openWorkspaceTab({ type: 'catalog', catalog: 'capabilities' });
        return;
      }
      if (key === 'explorer:business:business-services') {
        openWorkspaceTab({ type: 'catalog', catalog: 'businessServices' });
        return;
      }
      if (key === 'explorer:business:processes') {
        openWorkspaceTab({ type: 'catalog', catalog: 'processes' });
        return;
      }
      if (key === 'explorer:business:departments') {
        openWorkspaceTab({ type: 'catalog', catalog: 'departments' });
        return;
      }
      if (key === 'explorer:application:applications') {
        openWorkspaceTab({ type: 'catalog', catalog: 'applications' });
        return;
      }
      if (key === 'explorer:application:application-services') {
        openWorkspaceTab({ type: 'catalog', catalog: 'applicationServices' });
        return;
      }
      if (key === 'explorer:technology:technologies') {
        openWorkspaceTab({ type: 'catalog', catalog: 'technologies' });
        return;
      }
      if (key === 'explorer:implmig:programmes') {
        openWorkspaceTab({ type: 'catalog', catalog: 'programmes' });
        return;
      }

      if (key === 'explorer:implmig:projects') {
        openWorkspaceTab({ type: 'catalog', catalog: 'projects' });
        return;
      }

      if (key === 'explorer:implmig:plateaus') {
        return;
      }

      if (key === 'explorer:governance:principles') {
        openWorkspaceTab({ type: 'catalog', catalog: 'principles' });
        return;
      }
      if (key === 'explorer:governance:requirements') {
        openWorkspaceTab({ type: 'catalog', catalog: 'requirements' });
        return;
      }

      if (key.startsWith('explorer:views:')) {
        if (key === 'explorer:views:roadmaps') {
          const roadmaps = listRoadmaps();
          if (roadmaps.length > 0) {
            openWorkspaceTab({ type: 'roadmap', roadmapId: roadmaps[0]!.id });
          }
          return;
        }
        openRouteTab('/workspace');
        return;
      }

      if (key.startsWith('explorer:roadmap:')) {
        const roadmapId = key.replace('explorer:roadmap:', '').trim();
        const roadmap = getRoadmapById(roadmapId);
        if (!roadmap) {
          message.error('Roadmap not found.');
          return;
        }
        openWorkspaceTab({ type: 'roadmap', roadmapId });
        return;
      }

      if (key.startsWith('explorer:baseline:')) {
        const baselineId = key.replace('explorer:baseline:', '').trim();
        const baseline = getBaselineById(baselineId);
        if (!baseline) {
          message.error('Baseline not found.');
          return;
        }
        openWorkspaceTab({ type: 'baseline', baselineId });
        return;
      }

      if (key.startsWith('explorer:plateau:')) {
        const plateauId = key.replace('explorer:plateau:', '').trim();
        const plateau = getPlateauById(plateauId);
        if (!plateau) {
          message.error('Plateau not found.');
          return;
        }
        openWorkspaceTab({ type: 'plateau', plateauId });
        return;
      }

      if (key.startsWith('explorer:view:')) {
        const viewId = key.replace('explorer:view:', '').trim();
        if (viewId) openRouteTab(`/views/${viewId}`);
        return;
      }

      if (key.startsWith('explorer:element:')) {
        const id = normalizeElementKey(key);
        const obj = eaRepository?.objects.get(id);
        if (!obj) return;
        openPropertiesPanel({ elementId: obj.id, elementType: obj.type, dock: 'right', readOnly: false });
        return;
      }

      openRouteTab('/workspace');
    },
    [eaRepository, metadata?.architectureScope, metadata?.repositoryName, normalizeElementKey, openPropertiesPanel, openRouteTab, openWorkspaceTab],
  );

  const menuForKey = React.useCallback(
    (key: string) => {
      const withMenuOnClick = (items: MenuProps['items']) => {
        const actionMap = new Map<string, () => void>();
        const walk = (list?: MenuProps['items']) => {
          list?.forEach((item) => {
            if (!item) return;
            const typedItem = item as any;
            const itemKey = typedItem?.key;
            const handler = typedItem?.onClick as (() => void) | undefined;
            if (itemKey !== undefined && handler) actionMap.set(String(itemKey), handler);
            if (typedItem?.children) walk(typedItem.children as MenuProps['items']);
          });
        };
        walk(items);

        return {
          items,
          onClick: ({ key: clickedKey }) => {
            const handler = actionMap.get(String(clickedKey));
            if (handler) handler();
          },
        } as MenuProps;
      };

      if (metadata?.architectureScope === 'Programme' && key === ROOT_KEYS.implMig) {
        const show = showTechnologyInProgrammeScope;

        return withMenuOnClick([
            {
              key: 'openProgrammes',
              label: 'Open Programmes Catalog',
              onClick: () => openWorkspaceTab({ type: 'catalog', catalog: 'programmes' }),
            },
            {
              key: 'toggleTechnology',
              label: show ? 'Hide Technology Layer' : 'Show Technology Layer',
              onClick: () => {
                setShowTechnologyFlag(!show);
              },
            },
            {
              key: 'refresh',
              label: 'Refresh',
              onClick: () => setRefreshToken((x) => x + 1),
            },
          ]);
      }

      if (key === BUSINESS_UNIT_ENTERPRISE_PLACEHOLDER_KEY) {
        return withMenuOnClick([
            {
              key: 'create',
              icon: <PlusOutlined />,
              label: '+ Create Enterprise Root',
              onClick: () => createObject('Enterprise'),
            },
            {
              key: 'open',
              label: 'Open Enterprises Catalog',
              onClick: () => openWorkspaceTab({ type: 'catalog', catalog: 'enterprises' }),
            },
          ]);
      }

      // Collections: Create / Import / Bulk Edit / Refresh
      const collectionToCreateType: Record<string, ObjectType | undefined> = {
        'explorer:business:enterprises': 'Enterprise',
        'explorer:business:capabilities': 'Capability',
        'explorer:business:business-services': 'BusinessService',
        'explorer:business:processes': 'BusinessProcess',
        'explorer:business:departments': 'Department',
        'explorer:application:applications': 'Application',
        'explorer:application:application-services': 'ApplicationService',
        'explorer:technology:technologies': 'Technology',
        'explorer:implmig:programmes': 'Programme',
        'explorer:implmig:projects': 'Project',
        'explorer:governance:principles': 'Principle',
        'explorer:governance:requirements': 'Requirement',
      };

      const createType = collectionToCreateType[key];
      if (createType) {
        const canCreateElement = hasRepositoryPermission(userRole, 'createElement');
        const canImport = hasRepositoryPermission(userRole, 'import');
        const canBulkEdit = hasRepositoryPermission(userRole, 'bulkEdit');
        const csvEntityForType: Partial<Record<ObjectType, string>> = {
          Capability: 'Capabilities',
          BusinessProcess: 'BusinessProcesses',
          Application: 'Applications',
          Technology: 'Technologies',
          Programme: 'Programmes',
        };
        const csvEntity = csvEntityForType[createType];
        const programmeCreateBlocked =
          metadata?.architectureScope === 'Programme' &&
          createType !== 'Programme' &&
          countLiveObjectsByType(eaRepository?.objects ?? new Map<string, any>(), 'Programme') < 1;

        const initializationCreateDisabled = false;

        const createLabel = canCreateElement
          ? `+ Create ${titleForObjectType(createType)}`
          : readOnlyLabel(`+ Create ${titleForObjectType(createType)}`);
        const importLabel = canImport ? 'Import (CSV / Excel)' : readOnlyLabel('Import (CSV / Excel)');
        const bulkLabel = canBulkEdit ? 'Bulk Edit' : readOnlyLabel('Bulk Edit');

        const createDisabled = !canCreateElement || programmeCreateBlocked;
        const importDisabled = !canImport;
        const bulkDisabled = !canBulkEdit;

        const items = [
          {
            key: 'create',
            icon: <PlusOutlined />,
            label: createLabel,
            disabled: createDisabled,
            onClick: () => {
              if (!canCreateElement) {
                permissionGuard('createElement');
                return;
              }
              if (programmeCreateBlocked) {
                message.warning('Create at least one Programme before creating other elements.');
                return;
              }
              createObject(createType);
            },
          },
          {
            key: 'import',
            label: importLabel,
            disabled: importDisabled,
            onClick: () => {
              if (!canImport) {
                permissionGuard('import');
                return;
              }
              const target = csvEntity ? `/interoperability?csvEntity=${encodeURIComponent(csvEntity)}` : '/interoperability';
              openRouteTab(target);
              message.info(csvEntity ? `Opening Import Wizard for ${titleForObjectType(createType)}.` : 'Opening Import Wizard.');
            },
          },
          {
            key: 'bulk',
            label: bulkLabel,
            disabled: bulkDisabled,
            onClick: () => {
              if (!canBulkEdit) {
                permissionGuard('bulkEdit');
                return;
              }
              const target = csvEntity ? `/interoperability?csvEntity=${encodeURIComponent(csvEntity)}` : '/interoperability';
              openRouteTab(target);
              message.info(
                csvEntity
                  ? `Opening Import Wizard for bulk updates to ${titleForObjectType(createType)}.`
                  : 'Opening Import Wizard for bulk updates.',
              );
            },
          },
          {
            key: 'refresh',
            label: 'Refresh',
            onClick: () => setRefreshToken((x) => x + 1),
          },
        ];

        if (key === 'explorer:application:applications') {
          const menuItem = (
            mode: typeof applicationGrouping,
            label: string,
          ): {
            key: string;
            label: string;
            icon?: React.ReactNode;
            onClick: () => void;
          } => ({
            key: `app-group-${mode}`,
            label,
            icon: applicationGrouping === mode ? <CheckOutlined /> : undefined,
            onClick: () => setApplicationGrouping(mode),
          });

          items.push({ type: 'divider', key: 'app-group-divider' });
          items.push(menuItem('flat', 'Grouping: Flat'));
          items.push(menuItem('capability', 'Grouping: By Capability'));
          items.push(menuItem('lifecycle', 'Grouping: By Lifecycle'));
        }

        return withMenuOnClick(items);
      }

      // Element: Open Properties / Duplicate / Delete
      if (key.startsWith('explorer:element:')) {
        const id = normalizeElementKey(key);
        const obj = eaRepository?.objects.get(id);
        const isBusinessUnitRootEnterprise =
          metadata?.architectureScope === 'Business Unit' && obj?.type === 'Enterprise';
        const canCreateRelationship = hasRepositoryPermission(userRole, 'createRelationship');
        const canEditView = hasRepositoryPermission(userRole, 'editView');
        const canCreateElement = hasRepositoryPermission(userRole, 'createElement');
        const canDeleteElement = hasRepositoryPermission(userRole, 'deleteElement');
        const relationshipDisabled = !canCreateRelationship;
        const addToViewDisabled = !canEditView;
        const duplicateDisabled = !canCreateElement;
        const deleteDisabled = isBusinessUnitRootEnterprise || !canDeleteElement;
        return withMenuOnClick([
            {
              key: 'open',
              label: 'Open Properties',
              onClick: () => {
                if (!obj) return;
                openPropertiesPanel({ elementId: obj.id, elementType: obj.type, dock: 'right', readOnly: false });
              },
            },
            {
              key: 'rel',
              label: 'Create Relationship',
              disabled: false,
              onClick: () => {
                if (!obj) return;
                setRelationshipSource({ id: obj.id, type: obj.type, name: nameForObject(obj) });
                setSelectedRelationshipType('');
                setSelectedTargetId('');
                setRelationshipModalOpen(true);
              },
            },
            {
              key: 'addToView',
              label: 'Add to View',
              disabled: false,
              onClick: () => {
                if (!obj) return;
                if (savedViews.length === 0) {
                  message.warning('No saved views available. Create a view first.');
                  return;
                }
                setAddToViewTarget({ id: obj.id, name: nameForObject(obj), type: obj.type });
                setAddToViewViewId((prev) => prev || savedViews[0]?.id || '');
                setAddToViewModalOpen(true);
              },
            },
            {
              key: 'impact',
              label: 'Impact Analysis',
              onClick: () => {
                if (!obj) return;
                const name = nameForObject(obj);
                openWorkspaceTab({ type: 'impact-element', elementId: obj.id, elementName: name, elementType: obj.type });
              },
            },
            {
              key: 'dup',
              label: 'Duplicate',
              disabled: false,
              onClick: () => {
                if (!obj) return;
                duplicateObject(obj.id);
              },
            },
            {
              key: 'del',
              icon: <DeleteOutlined />,
              danger: true,
              label: 'Delete',
              disabled: false,
              onClick: () => {
                if (!obj) return;
                deleteObject(obj.id);
              },
            },
          ]);
      }

      // View: Open / Delete
      if (key.startsWith('explorer:view:')) {
        const viewId = key.replace('explorer:view:', '').trim();
        const canEditView = hasRepositoryPermission(userRole, 'editView');
        const deleteViewDisabled = !canEditView;
        return withMenuOnClick([
            {
              key: 'open',
              label: 'Open View',
              onClick: () => openWorkspaceTab({ type: 'view', viewId }),
            },
            {
              key: 'delete',
              icon: <DeleteOutlined />,
              danger: true,
              label: deleteViewDisabled ? readOnlyLabel('Delete View') : 'Delete View',
              disabled: deleteViewDisabled,
              onClick: () => deleteView(viewId),
            },
          ]);
      }

      if (key.startsWith('explorer:roadmap:')) {
        const roadmapId = key.replace('explorer:roadmap:', '').trim();
        return withMenuOnClick([
            {
              key: 'open',
              label: 'Open Roadmap (read-only)',
              onClick: () => openWorkspaceTab({ type: 'roadmap', roadmapId }),
            },
          ]);
      }

      if (key.startsWith('explorer:plateau:')) {
        const plateauId = key.replace('explorer:plateau:', '').trim();
        return withMenuOnClick([
            {
              key: 'open',
              label: 'Open Plateau (read-only)',
              onClick: () => openWorkspaceTab({ type: 'plateau', plateauId }),
            },
          ]);
      }

      if (key.startsWith('explorer:baseline:')) {
        const baselineId = key.replace('explorer:baseline:', '').trim();
        return withMenuOnClick([
            {
              key: 'open',
              label: 'Open Baseline (read-only)',
              onClick: () => openWorkspaceTab({ type: 'baseline', baselineId }),
            },
            {
              key: 'preview',
              label: 'Preview baseline metadata',
              onClick: () => {
                const baseline = getBaselineById(baselineId);
                if (!baseline) {
                  message.error('Baseline not found.');
                  return;
                }
                setBaselinePreview(baseline);
                setBaselinePreviewOpen(true);
              },
            },
          ]);
      }

      return withMenuOnClick([
          {
            key: 'refresh',
            label: 'Refresh',
            onClick: () => setRefreshToken((x) => x + 1),
          },
        ]);
    },
    [
      computeTargetOptions,
      createObject,
      deleteObject,
      deleteView,
      duplicateObject,
      eaRepository,
      initializationGuard,
      initializationState?.status,
      metadata?.architectureScope,
      normalizeElementKey,
      openForKey,
      openPropertiesPanel,
      openRouteTab,
      openWorkspaceTab,
      permissionGuard,
      readOnlyLabel,
      setBaselinePreview,
      setBaselinePreviewOpen,
      setShowTechnologyFlag,
      showTechnologyInProgrammeScope,
      updateViewRoot,
      userRole,
      views,
    ],
  );

  return (
    <div className={styles.explorerTree}>
      {hasRepository && isRepoEmpty && !seedBannerDismissed ? (
        <Alert
          type="info"
          showIcon
          closable
          onClose={dismissSeedBanner}
          message="Repository is empty"
          description={
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Typography.Text>Seed sample architecture data to avoid blank diagrams.</Typography.Text>
              <Button size="small" type="primary" onClick={openSeedSampleDataModal}>
                Seed sample architecture
              </Button>
            </Space>
          }
          style={{ marginBottom: 12 }}
        />
      ) : null}
      <Tree
        virtual
        height={treeHeight}
        itemHeight={34}
        showIcon
        showLine={{ showLeafIcon: false }}
        blockNode
        draggable={
          hierarchyEditingEnabled
            ? {
                icon: false,
                nodeDraggable: (node) => typeof node.key === 'string' && node.key.startsWith('explorer:element:'),
              }
            : false
        }
        selectable
        expandAction={false}
        expandedKeys={expandedKeys}
        onExpand={(next) => setExpandedKeys(next)}
        selectedKeys={selectedKeysFromContext}
        treeData={treeData}
        switcherIcon={({ expanded }) => (expanded ? <CaretDownOutlined /> : <CaretRightOutlined />)}
        showIcon={false}
        titleRender={(node) => {
          const k = typeof node.key === 'string' ? node.key : '';
          const isPathAncestor = typeof node.key === 'string' && activePathAncestors.has(node.key);
          return (
            <Dropdown trigger={['contextMenu']} menu={menuForKey(k)}>
              <span className={isPathAncestor ? styles.pathActive : undefined}>{node.title as any}</span>
            </Dropdown>
          );
        }}
        onDrop={handleDrop}
        onSelect={(selectedKeys: React.Key[], info) => {
          const key = selectedKeys?.[0];
          if (typeof key !== 'string') return;

          // Explorer rule: caret/switcher click should ONLY expand/collapse.
          const target = (info?.nativeEvent?.target as HTMLElement | null) ?? null;
          if (target?.closest?.('.ant-tree-switcher')) return;

          const data = (info?.node as any)?.data as { elementId?: string; elementType?: string };
          const effectiveKey = data?.elementId ? KEY.element(data.elementId) : key;

          setSelection({ kind: 'repository', keys: [effectiveKey] });
          if (effectiveKey.startsWith('explorer:element:')) {
            if (data?.elementId && data?.elementType) {
              setSelectedElement({ id: data.elementId, type: data.elementType, source: 'Explorer' });
            } else {
              const id = normalizeElementKey(effectiveKey);
              setSelectedElement({ id, type: 'Unknown', source: 'Explorer' });
            }
          }
          openForKey(effectiveKey);
        }}
        onRightClick={(info) => {
          const key = typeof info?.node?.key === 'string' ? (info.node.key as string) : '';
          if (key.startsWith('explorer:element:')) {
            const data = (info?.node as any)?.data as { elementId?: string; elementType?: string };
            if (data?.elementId && data?.elementType) {
              setSelectedElement({ id: data.elementId, type: data.elementType, source: 'Explorer' });
            } else {
              const id = normalizeElementKey(key);
              setSelectedElement({ id, type: 'Unknown', source: 'Explorer' });
            }
          }
        }}
      />

      <Modal
        open={relationshipModalOpen}
        title="Create Relationship"
        onCancel={() => setRelationshipModalOpen(false)}
        onOk={saveRelationshipFromModal}
        okText="Save"
        destroyOnClose
      >
        {relationshipSource ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Typography.Text type="secondary">Source Element</Typography.Text>
              <Input
                value={`${relationshipSource.name} · ${relationshipSource.type} · ${relationshipSource.id}`}
                disabled
                style={{ marginTop: 4 }}
              />
            </div>

            <div>
              <Typography.Text type="secondary">Relationship Type</Typography.Text>
              <Select
                value={selectedRelationshipType || undefined}
                options={(() => {
                  if (!relationshipSource) return [] as any[];
                  const def = OBJECT_TYPE_DEFINITIONS[relationshipSource.type as ObjectType];
                  const allowed = (def?.allowedOutgoingRelationships ?? []).filter((t) => {
                    if (!isValidRelationshipType(t)) return false;
                    const relDef = RELATIONSHIP_TYPE_DEFINITIONS[t];
                    return Boolean(relDef && relDef.fromTypes.includes(relationshipSource.type as ObjectType));
                  }) as RelationshipType[];
                  return allowed.map((t) => ({ value: t, label: t }));
                })()}
                onChange={(val) => {
                  const nextType = val as RelationshipType;
                  setSelectedRelationshipType(nextType);
                  const nextTargets = computeTargetOptions(nextType, relationshipSource);
                  setSelectedTargetId(nextTargets[0]?.value ?? '');
                }}
                placeholder="Select relationship type"
                style={{ width: '100%', marginTop: 4 }}
              />
            </div>

            <div>
              <Typography.Text type="secondary">Target Element</Typography.Text>
              <Select
                showSearch
                optionFilterProp="label"
                value={selectedTargetId || undefined}
                options={selectedRelationshipType && relationshipSource ? computeTargetOptions(selectedRelationshipType, relationshipSource) : []}
                onChange={(val) => setSelectedTargetId(String(val))}
                placeholder="Select target"
                style={{ width: '100%', marginTop: 4 }}
                disabled={!selectedRelationshipType}
              />
            </div>
          </div>
        ) : (
          <Typography.Text type="secondary">No source element selected.</Typography.Text>
        )}
      </Modal>

      <Modal
        open={addToViewModalOpen}
        title="Add to View"
        onCancel={() => setAddToViewModalOpen(false)}
        onOk={handleConfirmAddToView}
        okText="Add"
        okButtonProps={{ disabled: !addToViewViewId || !addToViewTarget }}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Typography.Text type="secondary">Target view</Typography.Text>
            <Select
              value={addToViewViewId || undefined}
              options={savedViews.map((v) => ({
                value: v.id,
                label: `${v.name} (${v.viewpointId})`,
              }))}
              onChange={(val) => setAddToViewViewId(val as string)}
              style={{ width: '100%', marginTop: 6 }}
              placeholder="Choose a view"
            />
          </div>

          {addToViewTarget ? (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Adds {addToViewTarget.name} ({addToViewTarget.type}) to the view scope. No elements or relationships are created.
            </Typography.Paragraph>
          ) : (
            <Typography.Text type="secondary">Select an element first, then choose Add to View.</Typography.Text>
          )}
        </Space>
      </Modal>

      <Modal
        open={baselinePreviewOpen}
        title={baselinePreview?.name || 'Baseline'}
        onCancel={() => {
          setBaselinePreview(null);
          setBaselinePreviewOpen(false);
        }}
        footer={null}
        destroyOnClose
      >
        {baselinePreview ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Text type="secondary">
              Read-only snapshot. Editing or deleting baselines is not allowed from Explorer.
            </Typography.Text>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Baseline id">{baselinePreview.id}</Descriptions.Item>
              <Descriptions.Item label="Created at">{baselinePreview.createdAt}</Descriptions.Item>
              <Descriptions.Item label="Created by">{baselinePreview.createdBy ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Description">{baselinePreview.description ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Elements captured">{baselinePreview.elements.length}</Descriptions.Item>
              <Descriptions.Item label="Relationships captured">{baselinePreview.relationships.length}</Descriptions.Item>
              <Descriptions.Item label="Source revisions">{`${baselinePreview.source.elementsRevision} | ${baselinePreview.source.relationshipsRevision}`}</Descriptions.Item>
            </Descriptions>
          </Space>
        ) : null}
      </Modal>
    </div>
  );
};

export default ExplorerTree;
