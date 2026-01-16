import React from 'react';
import { Alert, Button, Checkbox, Collapse, Descriptions, Empty, Form, Input, InputNumber, Modal, Select, Space, Tag, Tooltip, Typography, message, theme } from 'antd';
import { AppstoreOutlined, CloudOutlined, InfoCircleOutlined, LinkOutlined } from '@ant-design/icons';
import { useModel } from '@umijs/max';
import cytoscape, { type Core } from 'cytoscape';

import styles from './style.module.less';
import { OBJECT_TYPE_DEFINITIONS, RELATIONSHIP_TYPE_DEFINITIONS, type ObjectType, type RelationshipType } from '@/pages/dependency-view/utils/eaMetaModel';
import { isObjectTypeAllowedForReferenceFramework } from '@/repository/referenceFrameworkPolicy';
import { canCreateObjectTypeForLifecycleCoverage } from '@/repository/lifecycleCoveragePolicy';
import { isCustomFrameworkModelingEnabled, isObjectTypeEnabledForFramework } from '@/repository/customFrameworkConfig';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import { useIdeShell } from './index';
import { useIdeSelection } from '@/ide/IdeSelectionContext';
import { ENABLE_RBAC, hasRepositoryPermission, type RepositoryRole } from '@/repository/accessControl';
import { TRACEABILITY_CHECK_IDS, buildGovernanceDebt } from '@/ea/governanceValidation';
import { recordAuditEvent } from '@/repository/auditLog';
import { ViewStore } from '@/diagram-studio/view-runtime/ViewStore';
import { ViewpointRegistry } from '@/diagram-studio/viewpoints/ViewpointRegistry';
import { resolveViewScope } from '@/diagram-studio/viewpoints/resolveViewScope';
import type { ViewInstance } from '@/diagram-studio/viewpoints/ViewInstance';
import { CreateViewWizard } from '@/pages/views/create';
import type {
  DesignWorkspace,
  DesignWorkspaceLayout,
  DesignWorkspaceLayoutEdge,
  DesignWorkspaceLayoutNode,
  DesignWorkspaceScope,
  DesignWorkspaceStagedElement,
  DesignWorkspaceStagedRelationship,
  DesignWorkspaceStatus,
} from '@/ea/DesignWorkspaceStore';

type StudioShellProps = {
  propertiesPanel: React.ReactNode;
  designWorkspace: DesignWorkspace;
  onUpdateWorkspace: (next: DesignWorkspace) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onExit: (opts?: { suppressRefresh?: boolean }) => void;
};

type DesignWorkspaceForm = {
  name: string;
  description?: string;
  scope?: DesignWorkspaceScope;
  status: DesignWorkspaceStatus;
};

type QuickCreateForm = {
  type: ObjectType;
  name: string;
  description?: string;
};

type BulkEditForm = {
  namePrefix?: string;
  nameSuffix?: string;
  description?: string;
};

type StudioToolMode = 'SELECT' | 'CREATE_ELEMENT' | 'CREATE_RELATIONSHIP' | 'PAN';


const defaultIdPrefixForType = (type: ObjectType): string => {
  switch (type) {
    case 'Capability':
      return 'cap-';
    case 'Application':
      return 'app-';
    case 'Technology':
      return 'tech-';
    case 'Node':
      return 'node-';
    case 'Runtime':
      return 'rt-';
    case 'Database':
      return 'db-';
    case 'API':
      return 'api-';
    case 'MessageBroker':
      return 'mb-';
    case 'CloudService':
      return 'cloud-';
    default:
      return `${String(type).toLowerCase()}-`;
  }
};

const generateUUID = (): string => {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

const generateElementId = (type: ObjectType): string => {
  return `${defaultIdPrefixForType(type)}${generateUUID()}`;
};

const GRID_SIZE = 20;
const ALIGN_THRESHOLD = 6;
const LARGE_GRAPH_THRESHOLD = 200;
const DRAG_THROTTLE_MS = 50;
const REPO_SNAPSHOT_KEY = 'ea.repository.snapshot.v1';
const DRAFT_TARGET_ID = '__draft_target__';
const DRAFT_EDGE_ID = '__draft_edge__';

const viewLayoutStorageKey = (viewId: string) => `ea.view.layout.positions:${viewId}`;

const loadViewLayoutPositions = (viewId: string): Record<string, { x: number; y: number }> => {
  if (!viewId) return {};
  try {
    const raw = localStorage.getItem(viewLayoutStorageKey(viewId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, { x: number; y: number }>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const isMarkedForRemoval = (attributes?: Record<string, unknown> | null): boolean => {
  return Boolean((attributes as any)?._deleted === true);
};

const normalizeAttributesForCompare = (attributes?: Record<string, unknown> | null) => {
  const raw = { ...(attributes ?? {}) } as Record<string, unknown>;
  delete (raw as any).lastModifiedAt;
  delete (raw as any).lastModifiedBy;
  return raw;
};

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
};

const areAttributesEqual = (a?: Record<string, unknown> | null, b?: Record<string, unknown> | null) => {
  const left = normalizeAttributesForCompare(a);
  const right = normalizeAttributesForCompare(b);
  return stableStringify(left) === stableStringify(right);
};

const buildSvgIcon = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const TECHNOLOGY_VISUALS = [
  {
    type: 'Node',
    label: 'Node (Physical / Virtual)',
    color: '#e6f4ff',
    border: '#91caff',
    icon: buildSvgIcon(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="8" rx="1.5" fill="none" stroke="#434343" stroke-width="1.2"/><circle cx="5" cy="7" r="0.8" fill="#434343"/><circle cx="8" cy="7" r="0.8" fill="#434343"/><circle cx="11" cy="7" r="0.8" fill="#434343"/><rect x="5" y="12" width="6" height="1.5" rx="0.6" fill="#434343"/></svg>',
    ),
  },
  {
    type: 'Compute',
    label: 'Compute (VM, Container Host)',
    color: '#f0f5ff',
    border: '#adc6ff',
    icon: buildSvgIcon(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect x="4" y="4" width="8" height="8" rx="1.2" fill="none" stroke="#434343" stroke-width="1.2"/><path d="M2 6h2M2 10h2M12 6h2M12 10h2M6 2v2M10 2v2M6 12v2M10 12v2" stroke="#434343" stroke-width="1" stroke-linecap="round"/></svg>',
    ),
  },
  {
    type: 'Runtime',
    label: 'Runtime (JVM, Node.js, .NET)',
    color: '#f6ffed',
    border: '#b7eb8f',
    icon: buildSvgIcon(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="M4 3h8v10H4z" fill="none" stroke="#434343" stroke-width="1.2"/><path d="M6 5h4M6 8h4M6 11h2" stroke="#434343" stroke-width="1" stroke-linecap="round"/></svg>',
    ),
  },
  {
    type: 'Database',
    label: 'Database',
    color: '#fff7e6',
    border: '#ffd591',
    icon: buildSvgIcon(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><ellipse cx="8" cy="4" rx="4.5" ry="2.2" fill="none" stroke="#434343" stroke-width="1.2"/><path d="M3.5 4v6.5c0 1.2 2 2.2 4.5 2.2s4.5-1 4.5-2.2V4" fill="none" stroke="#434343" stroke-width="1.2"/></svg>',
    ),
  },
  {
    type: 'Storage',
    label: 'Storage',
    color: '#fff0f6',
    border: '#ffadd2',
    icon: buildSvgIcon(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect x="3" y="4" width="10" height="8" rx="1.2" fill="none" stroke="#434343" stroke-width="1.2"/><path d="M5 6h6M5 8h6M5 10h3" stroke="#434343" stroke-width="1" stroke-linecap="round"/></svg>',
    ),
  },
  {
    type: 'API',
    label: 'API / Gateway',
    color: '#f9f0ff',
    border: '#d3adf7',
    icon: buildSvgIcon(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="M5 5l-2 3 2 3" fill="none" stroke="#434343" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 5l2 3-2 3" fill="none" stroke="#434343" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 4l2 8" stroke="#434343" stroke-width="1.2" stroke-linecap="round"/></svg>',
    ),
  },
  {
    type: 'MessageBroker',
    label: 'Message Broker',
    color: '#e6fffb',
    border: '#87e8de',
    icon: buildSvgIcon(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect x="2.5" y="3" width="11" height="7" rx="1.5" fill="none" stroke="#434343" stroke-width="1.2"/><path d="M5 12l2-2h4" stroke="#434343" stroke-width="1.2" stroke-linecap="round"/></svg>',
    ),
  },
  {
    type: 'IntegrationPlatform',
    label: 'Integration Platform',
    color: '#f0f0f0',
    border: '#bfbfbf',
    icon: buildSvgIcon(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="2" fill="none" stroke="#434343" stroke-width="1.2"/><path d="M8 2v3M8 11v3M2 8h3M11 8h3" stroke="#434343" stroke-width="1.2" stroke-linecap="round"/><circle cx="3" cy="3" r="1" fill="#434343"/><circle cx="13" cy="3" r="1" fill="#434343"/><circle cx="3" cy="13" r="1" fill="#434343"/><circle cx="13" cy="13" r="1" fill="#434343"/></svg>',
    ),
  },
  {
    type: 'CloudService',
    label: 'Cloud Service',
    color: '#f0f7ff',
    border: '#a3d3ff',
    icon: buildSvgIcon(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="M4.5 11.5h7a2.5 2.5 0 0 0 .1-5 3.4 3.4 0 0 0-6.6-.8A2.6 2.6 0 0 0 4.5 11.5z" fill="none" stroke="#434343" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    ),
  },
] as const;

const StudioShell: React.FC<StudioShellProps> = ({
  propertiesPanel,
  designWorkspace,
  onUpdateWorkspace,
  onDeleteWorkspace,
  onExit,
}) => {
  const { token } = theme.useToken();
  const { initialState } = useModel('@@initialState');
  const { openPropertiesPanel } = useIdeShell();
  const { selection } = useIdeSelection();
  const { eaRepository, metadata, trySetEaRepository } = useEaRepository();
  const actor =
    initialState?.currentUser?.name || initialState?.currentUser?.userid || 'studio';
  const userRole: RepositoryRole = React.useMemo(() => {
    if (!ENABLE_RBAC) return 'Owner';
    const access = initialState?.currentUser?.access;
    if (access === 'admin') return 'Owner';
    if (access === 'architect' || access === 'user') return 'Architect';
    return 'Viewer';
  }, [initialState?.currentUser?.access]);
  const hasModelingAccess =
    hasRepositoryPermission(userRole, 'createElement') ||
    hasRepositoryPermission(userRole, 'editElement') ||
    hasRepositoryPermission(userRole, 'createRelationship') ||
    hasRepositoryPermission(userRole, 'editRelationship');
  const commitContextLocked = React.useMemo(() => {
    const key = selection?.activeDocument?.key ?? '';
    return key.startsWith('baseline:') || key.startsWith('plateau:') || key.startsWith('roadmap:');
  }, [selection?.activeDocument?.key]);
  const [stagedElements, setStagedElements] = React.useState<DesignWorkspaceStagedElement[]>(
    () => designWorkspace?.stagedElements ?? [],
  );
  const [stagedRelationships, setStagedRelationships] = React.useState<DesignWorkspaceStagedRelationship[]>(
    () => designWorkspace?.stagedRelationships ?? [],
  );
  const createElementHelperText = React.useMemo(() => {
    if (toolMode !== 'CREATE_ELEMENT' || !pendingElementType) return null;
    return `Click on canvas to place ${pendingElementType}`;
  }, [pendingElementType, toolMode]);
  const createElementFloatingHint = React.useMemo(() => {
    if (toolMode !== 'CREATE_ELEMENT' || !pendingElementType) return null;
    return `Placing: ${pendingElementType}`;
  }, [pendingElementType, toolMode]);
  const hasStagedChanges = stagedElements.length > 0 || stagedRelationships.length > 0;
  const commitDisabled = !hasStagedChanges || !hasModelingAccess || commitContextLocked || !eaRepository;
  const iterativeModeling = designWorkspace.mode === 'ITERATIVE';
  const modeBadge = React.useMemo(() => {
    if (!hasModelingAccess) return { label: 'Read-only', color: 'default' as const };
    if (designWorkspace.status === 'DRAFT') return { label: 'Draft', color: 'gold' as const };
    return { label: 'Studio', color: 'blue' as const };
  }, [designWorkspace.status, hasModelingAccess]);
  const cyRef = React.useRef<Core | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [form] = Form.useForm<{ name: string; description?: string }>();
  const [workspaceForm] = Form.useForm<DesignWorkspaceForm>();
  const [quickCreateForm] = Form.useForm<QuickCreateForm>();
  const [bulkEditForm] = Form.useForm<BulkEditForm>();
  const [repoEndpointForm] = Form.useForm<{ repositoryElementId: string }>();
  const [relationshipAttributesForm] = Form.useForm<Record<string, string>>();
  const guidanceIgnoreStorageKey = React.useMemo(
    () => `ea.studio.guidance.ignore.${designWorkspace.id}`,
    [designWorkspace.id],
  );
  const [ignoredGuidance, setIgnoredGuidance] = React.useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(guidanceIgnoreStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as string[];
      return Array.isArray(parsed) ? parsed.filter((m) => typeof m === 'string') : [];
    } catch {
      return [];
    }
  });

  const [workspaceModalOpen, setWorkspaceModalOpen] = React.useState(false);
  const [createViewModalOpen, setCreateViewModalOpen] = React.useState(false);
  const [activeViewName, setActiveViewName] = React.useState<string | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = React.useState(false);
  const [quickCreatePlacement, setQuickCreatePlacement] = React.useState<{ x: number; y: number } | null>(null);
  const [quickCreateType, setQuickCreateType] = React.useState<ObjectType | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = React.useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = React.useState<string[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = React.useState<string | null>(null);
  const [placementModeActive, setPlacementModeActive] = React.useState(false);
  const [placementGuide, setPlacementGuide] = React.useState<{ x: number; y: number } | null>(null);
  const [createHintPos, setCreateHintPos] = React.useState<{ x: number; y: number } | null>(null);
  const [elementDragAnchor, setElementDragAnchor] = React.useState<{ x: number; y: number } | null>(null);
  const [elementDragGhost, setElementDragGhost] = React.useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [elementDragActive, setElementDragActive] = React.useState(false);
  const elementDragMovedRef = React.useRef(false);
  const suppressNextTapRef = React.useRef(false);
  const [alignmentGuides, setAlignmentGuides] = React.useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });
  const [commitOpen, setCommitOpen] = React.useState(false);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const [repoEndpointOpen, setRepoEndpointOpen] = React.useState(false);
  const [repoEndpointMode, setRepoEndpointMode] = React.useState<'source' | 'target'>('target');
  const [toolMode, setToolMode] = React.useState<StudioToolMode>('SELECT');
  const [lastAutoSaveAt, setLastAutoSaveAt] = React.useState<string | null>(null);
  const [isLargeGraph, setIsLargeGraph] = React.useState(false);
  const dragThrottleRef = React.useRef(0);
  const [relationshipDraft, setRelationshipDraft] = React.useState<{
    sourceId: string | null;
    targetId: string | null;
    valid: boolean | null;
    message: string | null;
    dragging: boolean;
  }>({
    sourceId: null,
    targetId: null,
    valid: null,
    message: null,
    dragging: false,
  });

  const [layerVisibility, setLayerVisibility] = React.useState<{
    Business: boolean;
    Application: boolean;
    Technology: boolean;
  }>({
    Business: true,
    Application: true,
    Technology: true,
  });
  const [gridSize, setGridSize] = React.useState(GRID_SIZE);
  const [snapTemporarilyDisabled, setSnapTemporarilyDisabled] = React.useState(false);
  const [activePaletteSections, setActivePaletteSections] = React.useState<string[]>([]);

  const [pendingElementType, setPendingElementType] = React.useState<ObjectType | null>(null);
  const [placement, setPlacement] = React.useState<{ x: number; y: number } | null>(null);
  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [pendingRelationshipType, setPendingRelationshipType] = React.useState<RelationshipType | null>(null);
  const [relationshipSourceId, setRelationshipSourceId] = React.useState<string | null>(null);
  const [relationshipTargetId, setRelationshipTargetId] = React.useState<string | null>(null);
  const [auditPreviewOpen, setAuditPreviewOpen] = React.useState(false);
  const [propertiesExpanded, setPropertiesExpanded] = React.useState(false);
  const [pendingElementDraft, setPendingElementDraft] = React.useState<
    | {
        type: ObjectType;
        name: string;
        description: string;
        placement: { x: number; y: number } | null;
      }
    | null
  >(null);

  const paletteBusinessElements = React.useMemo(() => {
    const allowed = ['Capability', 'Application'] as const;
    return allowed
      .map((type) => OBJECT_TYPE_DEFINITIONS[type])
      .filter(Boolean);
  }, []);

  const paletteTechnologyElements = React.useMemo(() => {
    const allowed = [
      'Node',
      'Compute',
      'Runtime',
      'Database',
      'Storage',
      'API',
      'MessageBroker',
      'IntegrationPlatform',
      'CloudService',
    ] as const;
    return allowed
      .map((type) => OBJECT_TYPE_DEFINITIONS[type])
      .filter(Boolean);
  }, []);

  const paletteRelationships = React.useMemo(() => {
    const allowed = ['SUPPORTS', 'DEPENDS_ON', 'COMPOSED_OF', 'CONNECTS_TO', 'USES', 'HOSTED_ON'] as const;
    return allowed
      .map((type) => RELATIONSHIP_TYPE_DEFINITIONS[type])
      .filter(Boolean);
  }, []);

  const technologyVisualByType = React.useMemo(() => {
    return new Map(TECHNOLOGY_VISUALS.map((entry) => [entry.type, entry] as const));
  }, []);

  const renderTypeIcon = React.useCallback(
    (type?: ObjectType | null) => {
      if (!type) {
        return (
          <span className={styles.studioTypeIcon} style={{ background: '#d9d9d9' }}>
            ?
          </span>
        );
      }
      const tech = technologyVisualByType.get(type as any);
      if (tech?.icon) {
        return <img src={tech.icon} alt={type} width={16} height={16} />;
      }
      const layer = OBJECT_TYPE_DEFINITIONS[type]?.layer;
      const layerColor: Record<string, string> = {
        Strategy: '#b37feb',
        Business: '#95de64',
        Application: '#69b1ff',
        Technology: '#ffd666',
      };
      const bg = layer ? layerColor[layer] : '#d9d9d9';
      return (
        <span className={styles.studioTypeIcon} style={{ background: bg }}>
          {type.charAt(0).toUpperCase()}
        </span>
      );
    },
    [technologyVisualByType],
  );

  const openPaletteSection = React.useCallback((key: string) => {
    setActivePaletteSections((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);

  const applyLayerVisibility = React.useCallback(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        const elementType = node.data('elementType') as ObjectType | undefined;
        const layer = elementType ? OBJECT_TYPE_DEFINITIONS[elementType]?.layer : null;
        const visible = layer ? layerVisibility[layer] !== false : true;
        node.toggleClass('layerHidden', !visible);
      });

      cy.edges().forEach((edge) => {
        const sourceHidden = edge.source().hasClass('layerHidden');
        const targetHidden = edge.target().hasClass('layerHidden');
        edge.toggleClass('layerHidden', sourceHidden || targetHidden);
      });
    });
  }, [layerVisibility]);


  const workspaceStatusColor: Record<DesignWorkspaceStatus, string> = {
    DRAFT: 'gold',
    COMMITTED: 'green',
    DISCARDED: 'red',
  };

  const stagedElementById = React.useMemo(() => {
    return new Map(stagedElements.map((e) => [e.id, e] as const));
  }, [stagedElements]);

  const requiredElementAttributes = React.useCallback((type: ObjectType): string[] => {
    const def = OBJECT_TYPE_DEFINITIONS[type];
    if (!def || def.layer !== 'Technology') return [];
    return def.attributes.filter((attr) => attr !== 'name' && attr !== 'description');
  }, []);

  const validateStudioElementType = React.useCallback(
    (type: ObjectType): boolean => {
      if (!OBJECT_TYPE_DEFINITIONS[type]) {
        message.error(`Element type "${type}" is not allowed in Studio.`);
        return false;
      }

      if (!metadata) {
        message.error('Repository metadata is not available.');
        return false;
      }

      if (metadata.referenceFramework === 'Custom') {
        if (!isCustomFrameworkModelingEnabled('Custom', metadata.frameworkConfig ?? undefined)) {
          message.warning('Custom framework: define at least one element type in Metamodel to enable modeling.');
          return false;
        }

        if (!isObjectTypeEnabledForFramework('Custom', metadata.frameworkConfig ?? undefined, type)) {
          message.warning(`Custom framework: element type "${type}" is not enabled.`);
          return false;
        }
      }

      if (!isObjectTypeAllowedForReferenceFramework(metadata.referenceFramework, type)) {
        message.warning(`Type "${type}" is not enabled for the selected Reference Framework.`);
        return false;
      }

      const lifecycleGuard = canCreateObjectTypeForLifecycleCoverage(metadata.lifecycleCoverage, type);
      if (!lifecycleGuard.ok) {
        message.warning(lifecycleGuard.reason);
        return false;
      }

      return true;
    },
    [metadata],
  );

  const toCanvasPosition = React.useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current || !cyRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const renderedX = clientX - rect.left;
    const renderedY = clientY - rect.top;
    const pan = cyRef.current.pan();
    const zoom = cyRef.current.zoom();
    return {
      x: (renderedX - pan.x) / zoom,
      y: (renderedY - pan.y) / zoom,
    };
  }, []);

  const currentRepositoryUpdatedAt = React.useMemo(() => {
    try {
      const raw = localStorage.getItem(REPO_SNAPSHOT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { updatedAt?: string };
      return typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null;
    } catch {
      return null;
    }
  }, []);

  const governanceMode = metadata?.governanceMode ?? 'Advisory';

  const resolveElementLabel = React.useCallback(
    (id: string): { label: string; type: ObjectType } | null => {
      const staged = stagedElementById.get(id);
      if (staged) return { label: staged.name || id, type: staged.type };
      const repoObj = eaRepository?.objects.get(id);
      if (!repoObj) return null;
      const name = (repoObj.attributes as any)?.name;
      const label = typeof name === 'string' && name.trim() ? name.trim() : id;
      return { label, type: repoObj.type };
    },
    [eaRepository, stagedElementById],
  );

  const selectedStagedElements = React.useMemo(() => {
    if (selectedNodeIds.length === 0) return [] as DesignWorkspaceStagedElement[];
    const selectedSet = new Set(selectedNodeIds);
    return stagedElements.filter((e) => selectedSet.has(e.id));
  }, [selectedNodeIds, stagedElements]);

  const stagedSelectedElement = React.useMemo(() => {
    if (selectedStagedElements.length !== 1) return null;
    return selectedStagedElements[0];
  }, [selectedStagedElements]);

  const stagedSelectedRelationship = React.useMemo(() => {
    if (!selectedEdgeId) return null;
    return stagedRelationships.find((r) => r.id === selectedEdgeId) ?? null;
  }, [selectedEdgeId, stagedRelationships]);

  const stagedSelectedElementExistsInRepo = React.useMemo(() => {
    if (!stagedSelectedElement || !eaRepository) return false;
    return eaRepository.objects.has(stagedSelectedElement.id);
  }, [eaRepository, stagedSelectedElement]);

  const stagedSelectedRelationshipExistsInRepo = React.useMemo(() => {
    if (!stagedSelectedRelationship || !eaRepository) return false;
    return Boolean(
      eaRepository.relationships.find((rel) =>
        rel.id === stagedSelectedRelationship.id ||
        (rel.fromId === stagedSelectedRelationship.fromId &&
          rel.toId === stagedSelectedRelationship.toId &&
          rel.type === stagedSelectedRelationship.type),
      ),
    );
  }, [eaRepository, stagedSelectedRelationship]);

  const selectedNodeId = React.useMemo(
    () => (selectedNodeIds.length === 1 ? selectedNodeIds[0] : null),
    [selectedNodeIds],
  );

  const selectedExistingElement = React.useMemo(() => {
    if (!iterativeModeling || !selectedNodeId) return null;
    if (stagedElementById.has(selectedNodeId)) return null;
    return eaRepository?.objects.get(selectedNodeId) ?? null;
  }, [eaRepository, iterativeModeling, selectedNodeId, stagedElementById]);

  const compactSelectedElement = React.useMemo(() => {
    if (stagedSelectedElement) {
      return {
        name: stagedSelectedElement.name || stagedSelectedElement.id,
        type: stagedSelectedElement.type,
      };
    }
    if (selectedExistingElement) {
      const name = (selectedExistingElement.attributes as any)?.name;
      return {
        name: typeof name === 'string' && name.trim() ? name.trim() : selectedExistingElement.id,
        type: selectedExistingElement.type,
      };
    }
    if (selectedNodeId) {
      const resolved = resolveElementLabel(selectedNodeId);
      if (resolved) return { name: resolved.label, type: resolved.type };
    }
    return null;
  }, [resolveElementLabel, selectedExistingElement, selectedNodeId, stagedSelectedElement]);

  const compactWarningCount = React.useMemo(() => {
    if (!validationSummary) return 0;
    return validationSummary.warningCount;
  }, [validationSummary]);

  const resolveExistingRelationship = React.useCallback(
    (edgeId: string) => {
      const edge = cyRef.current?.getElementById(edgeId);
      const edgeData = edge && !edge.empty() ? edge.data() : null;
      const fromId = String(edgeData?.source ?? '');
      const toId = String(edgeData?.target ?? '');
      const type = edgeData?.relationshipType as RelationshipType | undefined;
      if (!fromId || !toId || !type) return null;
      const repoMatch = eaRepository?.relationships.find(
        (rel) =>
          rel.id === edgeId ||
          (rel.fromId === fromId && rel.toId === toId && rel.type === type),
      );
      return {
        id: repoMatch?.id ?? edgeId,
        fromId,
        toId,
        type,
        attributes: { ...(repoMatch?.attributes ?? {}) },
      };
    },
    [eaRepository],
  );

  const selectedExistingRelationship = React.useMemo(() => {
    if (!iterativeModeling || !selectedEdgeId) return null;
    if (stagedSelectedRelationship) return null;
    return resolveExistingRelationship(selectedEdgeId);
  }, [iterativeModeling, resolveExistingRelationship, selectedEdgeId, stagedSelectedRelationship]);

  React.useEffect(() => {
    if (!stagedSelectedRelationship) {
      relationshipAttributesForm.resetFields();
      return;
    }

    const relDef = RELATIONSHIP_TYPE_DEFINITIONS[stagedSelectedRelationship.type];
    const attrs = stagedSelectedRelationship.attributes ?? {};
    const nextValues: Record<string, string> = {};
    (relDef?.attributes ?? []).forEach((attr) => {
      const value = (attrs as any)?.[attr];
      if (typeof value === 'string') {
        nextValues[attr] = value;
      } else if (value === null || value === undefined) {
        nextValues[attr] = '';
      } else {
        nextValues[attr] = String(value);
      }
    });
    relationshipAttributesForm.setFieldsValue(nextValues);
  }, [relationshipAttributesForm, stagedSelectedRelationship?.id, stagedSelectedRelationship?.type]);

  const deleteStagedElement = React.useCallback(
    (elementId: string) => {
      setStagedElements((prev) => prev.filter((el) => el.id !== elementId));
      setStagedRelationships((prev) => prev.filter((rel) => rel.fromId !== elementId && rel.toId !== elementId));
      if (cyRef.current) {
        const cy = cyRef.current;
        cy.remove(`node#${elementId}`);
        cy.edges().filter((e) => e.data('source') === elementId || e.data('target') === elementId).remove();
        setIsLargeGraph(cy.nodes().length > LARGE_GRAPH_THRESHOLD);
      }
      setSelectedNodeIds((prev) => prev.filter((id) => id !== elementId));
    },
    [],
  );

  const deleteStagedRelationship = React.useCallback(
    (relationshipId: string) => {
      setStagedRelationships((prev) => prev.filter((rel) => rel.id !== relationshipId));
      if (cyRef.current) {
        cyRef.current.remove(`edge#${relationshipId}`);
      }
      setSelectedEdgeId((prev) => (prev === relationshipId ? null : prev));
    },
    [],
  );

  const clearRelationshipDraftArtifacts = React.useCallback(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    cy.getElementById(DRAFT_EDGE_ID)?.remove();
    cy.getElementById(DRAFT_TARGET_ID)?.remove();
    cy.nodes().removeClass('validTarget').removeClass('invalidTarget');
  }, []);

  const resetToolDrafts = React.useCallback(() => {
    setPendingElementType(null);
    setPendingRelationshipType(null);
    setRelationshipSourceId(null);
    setRelationshipTargetId(null);
    setRelationshipDraft({ sourceId: null, targetId: null, valid: null, message: null, dragging: false });
    setPlacementModeActive(false);
    setPlacementGuide(null);
    setCreateHintPos(null);
    clearRelationshipDraftArtifacts();
  }, [clearRelationshipDraftArtifacts]);

  React.useEffect(() => {
    if (toolMode === 'CREATE_RELATIONSHIP' && !pendingRelationshipType) {
      setToolMode('SELECT');
    }
  }, [pendingRelationshipType, toolMode]);

  const cancelCreation = React.useCallback(() => {
    setPendingElementType(null);
    setPlacement(null);
    setCreateModalOpen(false);
    setAuditPreviewOpen(false);
    setPendingElementDraft(null);
    setPendingRelationshipType(null);
    setRelationshipSourceId(null);
    setRelationshipTargetId(null);
    setQuickCreateOpen(false);
    setRepoEndpointOpen(false);
    setRelationshipDraft({ sourceId: null, targetId: null, valid: null, message: null, dragging: false });
    setPlacementModeActive(false);
    setPlacementGuide(null);
    clearRelationshipDraftArtifacts();
  }, [clearRelationshipDraftArtifacts]);

  const stagedValidationErrors = React.useMemo(() => {
    if (iterativeModeling) return [] as string[];
    const errors: string[] = [];
    const activeElements = stagedElements.filter((el) => !isMarkedForRemoval(el.attributes));
    const activeRelationships = stagedRelationships.filter((rel) => !isMarkedForRemoval(rel.attributes));
    const traceabilityCheckEnabled = activeElements.some(
      (el) => el.modelingState === 'REVIEW_READY' || el.modelingState === 'APPROVED',
    );

    for (const el of activeElements) {
      if (!el.name || !el.name.trim()) errors.push(`Element ${el.id}: name is required.`);
      const requiredAttrs = requiredElementAttributes(el.type);
      if (requiredAttrs.length > 0) {
        const attrs = el.attributes ?? {};
        requiredAttrs.forEach((attr) => {
          const value = (attrs as any)?.[attr];
          const missing =
            value === null ||
            value === undefined ||
            (typeof value === 'string' && !value.trim());
          if (missing) {
            errors.push(`Element ${el.id}: ${attr} is required.`);
          }
        });
      }
    }
    for (const rel of activeRelationships) {
      if (!rel.fromId || !rel.toId) errors.push(`Relationship ${rel.id}: missing endpoints.`);
      const sourceOk = rel.fromId ? Boolean(resolveElementLabel(rel.fromId)) : false;
      const targetOk = rel.toId ? Boolean(resolveElementLabel(rel.toId)) : false;
      if (!sourceOk || !targetOk) {
        errors.push(`Relationship ${rel.id}: endpoints must exist in workspace or repository.`);
      }
      const sourceStaged = stagedElementById.has(rel.fromId);
      const targetStaged = stagedElementById.has(rel.toId);
      if (!sourceStaged && !targetStaged) {
        errors.push(`Relationship ${rel.id}: at least one endpoint must be staged in Studio.`);
      }
      const relDef = RELATIONSHIP_TYPE_DEFINITIONS[rel.type];
      const requiredAttrs = relDef?.attributes ?? [];
      if (requiredAttrs.length > 0) {
        const attrs = (rel as DesignWorkspaceStagedRelationship).attributes ?? {};
        requiredAttrs.forEach((attr) => {
          const value = (attrs as any)?.[attr];
          const missing =
            value === null ||
            value === undefined ||
            (typeof value === 'string' && !value.trim());
          if (missing) {
            errors.push(`Relationship ${rel.id}: ${attr} is required.`);
          }
        });
      }
    }
    return errors;
  }, [iterativeModeling, requiredElementAttributes, resolveElementLabel, stagedElements, stagedRelationships]);

  const mandatoryCommitRelationshipErrors = React.useMemo(() => {
    if (iterativeModeling) return [] as string[];
    if (!eaRepository) return [] as string[];
    const errors: string[] = [];
    const activeElements = stagedElements.filter((el) => !isMarkedForRemoval(el.attributes));
    const activeRelationships = stagedRelationships.filter((rel) => !isMarkedForRemoval(rel.attributes));
    const elementTypeById = new Map<string, ObjectType>();
    const elementAttrsById = new Map<string, Record<string, unknown>>();
    const traceabilityCheckEnabled = activeElements.some(
      (el) => el.modelingState === 'REVIEW_READY' || el.modelingState === 'APPROVED',
    );

    eaRepository.objects.forEach((obj) => {
      elementTypeById.set(obj.id, obj.type);
      elementAttrsById.set(obj.id, obj.attributes ?? {});
    });
    activeElements.forEach((el) => {
      elementTypeById.set(el.id, el.type);
      elementAttrsById.set(el.id, el.attributes ?? {});
    });

    const relationships = [
      ...eaRepository.relationships.map((rel) => ({
        fromId: rel.fromId,
        toId: rel.toId,
        type: rel.type,
      })),
      ...activeRelationships.map((rel) => ({
        fromId: rel.fromId,
        toId: rel.toId,
        type: rel.type,
      })),
    ];

    const typeOf = (id: string) => elementTypeById.get(id);
    const isEnterprise = (t?: ObjectType) => t === 'Enterprise';
    const isDepartment = (t?: ObjectType) => t === 'Department';

    const countRelationships = (predicate: (rel: { fromId: string; toId: string; type: RelationshipType }) => boolean) =>
      relationships.filter(predicate).length;

    for (const el of activeElements) {
      const attrs = elementAttrsById.get(el.id) ?? {};
      const ownerId = typeof (attrs as any)?.ownerId === 'string' ? String((attrs as any).ownerId).trim() : '';
      if (!ownerId) {
        errors.push(`${el.type} ${el.name || el.id} is missing owner (Enterprise/Department).`);
      } else if (!(isEnterprise(typeOf(ownerId)) || isDepartment(typeOf(ownerId)))) {
        errors.push(`${el.type} ${el.name || el.id} has invalid owner reference (${ownerId}).`);
      } else if ((el.type === 'Enterprise' || el.type === 'Department') && ownerId === el.id) {
        // self-ownership allowed
      }

      if (el.type === 'Capability' || el.type === 'SubCapability' || el.type === 'Application' || el.type === 'Programme') {
        const owningCount = countRelationships(
          (r) => r.type === 'OWNS' && r.toId === el.id && isEnterprise(typeOf(r.fromId)),
        );
        if (owningCount !== 1) {
          errors.push(`${el.type} ${el.name || el.id} must have exactly one owning Enterprise via OWNS.`);
        }
      }

      if (el.type === 'Department') {
        const owningCount = countRelationships(
          (r) => r.type === 'HAS' && r.toId === el.id && isEnterprise(typeOf(r.fromId)),
        );
        if (owningCount !== 1) {
          errors.push(`Department ${el.name || el.id} must belong to exactly one Enterprise via HAS.`);
        }
      }

      if (el.type === 'BusinessService' && traceabilityCheckEnabled) {
        const mappedCaps = countRelationships(
          (r) =>
            r.type === 'REALIZED_BY' &&
            r.toId === el.id &&
            (typeOf(r.fromId) === 'Capability' || typeOf(r.fromId) === 'SubCapability'),
        );
        if (mappedCaps === 0) {
          errors.push(`BusinessService ${el.name || el.id} must link to at least one Capability via REALIZED_BY.`);
        }
      }

      if (el.type === 'Capability' && traceabilityCheckEnabled) {
        const realizedServiceIds = new Set<string>();
        relationships.forEach((r) => {
          if (r.type !== 'REALIZED_BY') return;
          if (r.fromId !== el.id) return;
          if (typeOf(r.toId) !== 'BusinessService') return;
          realizedServiceIds.add(r.toId);
        });
        const supportingAppServices = new Set<string>();
        realizedServiceIds.forEach((svcId) => {
          relationships.forEach((r) => {
            if (r.type !== 'SUPPORTED_BY') return;
            if (r.fromId !== svcId) return;
            if (typeOf(r.toId) !== 'ApplicationService') return;
            supportingAppServices.add(r.toId);
          });
        });
        if (supportingAppServices.size === 0) {
          errors.push(`Capability ${el.name || el.id} must be supported by at least one ApplicationService.`);
        }
      }

      if (el.type === 'ApplicationService' && traceabilityCheckEnabled) {
        const providerCount = countRelationships(
          (r) => r.type === 'PROVIDES' && r.toId === el.id && typeOf(r.fromId) === 'Application',
        );
        if (providerCount !== 1) {
          errors.push(`ApplicationService ${el.name || el.id} must belong to exactly one Application via PROVIDES.`);
        }
      }
    }

    return errors;
  }, [eaRepository, iterativeModeling, stagedElements, stagedRelationships]);

  const validateRelationshipEndpoints = React.useCallback(
    (sourceId: string, targetId: string, type: RelationshipType) => {
      const source = resolveElementLabel(sourceId);
      const target = resolveElementLabel(targetId);
      if (!source || !target) {
        return { valid: false, message: 'Select valid source and target elements.' };
      }
      const sourceStaged = stagedElementById.has(sourceId);
      const targetStaged = stagedElementById.has(targetId);
      if (!iterativeModeling && !sourceStaged && !targetStaged) {
        return {
          valid: false,
          message: 'At least one endpoint must be staged in Studio. Committed → committed relationships must be created outside Studio.',
        };
      }
      const relDef = RELATIONSHIP_TYPE_DEFINITIONS[type];
      if (!relDef) return { valid: false, message: 'Unknown relationship type.' };
      const pairs = relDef.allowedEndpointPairs ?? [];
      const valid =
        (Array.isArray(pairs) && pairs.length > 0
          ? pairs.some((p) => p.from === source.type && p.to === target.type)
          : relDef.fromTypes.includes(source.type) && relDef.toTypes.includes(target.type));
      if (!valid) {
        return {
          valid: false,
          message: `Invalid endpoints: ${source.type} → ${target.type} for ${type.replace(/_/g, ' ')}`,
        };
      }
      return { valid: true, message: `${source.type} → ${target.type} valid.` };
    },
    [iterativeModeling, resolveElementLabel, stagedElementById],
  );

  const getValidTargetsForSource = React.useCallback(
    (sourceId: string, type: RelationshipType) => {
      const source = resolveElementLabel(sourceId);
      if (!source) return new Set<string>();
      const relDef = RELATIONSHIP_TYPE_DEFINITIONS[type];
      if (!relDef) return new Set<string>();
      const validTargets = new Set<string>();
      const pairs = relDef.allowedEndpointPairs ?? [];
      const sourceStaged = stagedElementById.has(sourceId);

      cyRef.current?.nodes().forEach((node) => {
        const targetId = String(node.id());
        if (targetId === sourceId) return;
        const target = resolveElementLabel(targetId);
        if (!target) return;
        if (!iterativeModeling && !sourceStaged && !stagedElementById.has(targetId)) return;

        const valid =
          (Array.isArray(pairs) && pairs.length > 0
            ? pairs.some((p) => p.from === source.type && p.to === target.type)
            : relDef.fromTypes.includes(source.type) && relDef.toTypes.includes(target.type));
        if (valid) validTargets.add(targetId);
      });

      return validTargets;
    },
    [iterativeModeling, resolveElementLabel, stagedElementById],
  );

  const repositoryElementOptions = React.useMemo(() => {
    if (!eaRepository) return [];
    return Array.from(eaRepository.objects.values()).map((obj) => {
      const name = (obj.attributes as any)?.name;
      const label = typeof name === 'string' && name.trim() ? `${name} (${obj.type})` : `${obj.id} (${obj.type})`;
      return { value: obj.id, label };
    });
  }, [eaRepository]);

  const getAlignmentGuideForNode = React.useCallback((nodeId: string) => {
    if (!cyRef.current) return { x: null as number | null, y: null as number | null };
    const cy = cyRef.current;
    const node = cy.getElementById(nodeId);
    if (!node || node.empty()) return { x: null, y: null };
    const pos = node.position();
    const halfW = node.outerWidth() / 2;
    const halfH = node.outerHeight() / 2;
    const nodeXs = [pos.x, pos.x - halfW, pos.x + halfW];
    const nodeYs = [pos.y, pos.y - halfH, pos.y + halfH];

    let nearestX: number | null = null;
    let nearestY: number | null = null;
    let minDx = Number.POSITIVE_INFINITY;
    let minDy = Number.POSITIVE_INFINITY;

    cy.nodes().forEach((n) => {
      if (n.id() === nodeId) return;
      const p = n.position();
      const nHalfW = n.outerWidth() / 2;
      const nHalfH = n.outerHeight() / 2;
      const otherXs = [p.x, p.x - nHalfW, p.x + nHalfW];
      const otherYs = [p.y, p.y - nHalfH, p.y + nHalfH];

      nodeXs.forEach((x) => {
        otherXs.forEach((ox) => {
          const dx = Math.abs(ox - x);
          if (dx < minDx && dx <= ALIGN_THRESHOLD) {
            minDx = dx;
            nearestX = ox;
          }
        });
      });

      nodeYs.forEach((y) => {
        otherYs.forEach((oy) => {
          const dy = Math.abs(oy - y);
          if (dy < minDy && dy <= ALIGN_THRESHOLD) {
            minDy = dy;
            nearestY = oy;
          }
        });
      });
    });

    return { x: nearestX, y: nearestY };
  }, []);

  const snapPosition = React.useCallback(
    (nodeId: string) => {
      if (!cyRef.current) return;
      const cy = cyRef.current;
      const node = cy.getElementById(nodeId);
      if (!node || node.empty()) return;
      const pos = node.position();
      const guides = getAlignmentGuideForNode(nodeId);
      const size = Math.max(4, Math.round(gridSize));
      const snapX = guides.x ?? Math.round(pos.x / size) * size;
      const snapY = guides.y ?? Math.round(pos.y / size) * size;
      node.position({ x: snapX, y: snapY });
    },
    [getAlignmentGuideForNode, gridSize],
  );

  const getCanvasCenter = React.useCallback(() => {
    if (!cyRef.current) return { x: 0, y: 0 };
    const extent = cyRef.current.extent();
    return {
      x: (extent.x1 + extent.x2) / 2,
      y: (extent.y1 + extent.y2) / 2,
    };
  }, []);

  const distributeSelectedNodes = React.useCallback(
    (axis: 'x' | 'y') => {
      if (!cyRef.current) return;
      const cy = cyRef.current;
      const nodes = selectedNodeIds
        .map((id) => cy.getElementById(id))
        .filter((n) => n && !n.empty() && (iterativeModeling || n.data('staged')));

      if (nodes.length < 3) {
        message.info(iterativeModeling ? 'Select at least three elements to distribute.' : 'Select at least three staged elements to distribute.');
        return;
      }

      const sorted = nodes.slice().sort((a, b) => {
        const aPos = a.position();
        const bPos = b.position();
        return axis === 'x' ? aPos.x - bPos.x : aPos.y - bPos.y;
      });

      const firstPos = sorted[0].position();
      const lastPos = sorted[sorted.length - 1].position();
      const span = axis === 'x' ? lastPos.x - firstPos.x : lastPos.y - firstPos.y;
      if (!Number.isFinite(span) || span === 0) return;

      const step = span / (sorted.length - 1);
      sorted.forEach((node, index) => {
        const pos = node.position();
        if (axis === 'x') {
          node.position({ x: firstPos.x + step * index, y: pos.y });
        } else {
          node.position({ x: pos.x, y: firstPos.y + step * index });
        }
      });

      setAlignmentGuides({ x: null, y: null });
    },
    [iterativeModeling, selectedNodeIds],
  );

  const resetLayout = React.useCallback(() => {
    if (!cyRef.current) return;
    cyRef.current.layout({ name: 'grid', fit: true, avoidOverlap: true }).run();
  }, []);

  const cleanAlignToGrid = React.useCallback(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    cy.nodes().forEach((node) => {
      if (!iterativeModeling && !node.data('staged')) return;
      snapPosition(String(node.id()));
    });
    setAlignmentGuides({ x: null, y: null });
  }, [iterativeModeling, snapPosition]);

  const buildLayoutFromCanvas = React.useCallback((): DesignWorkspaceLayout => {
    if (!cyRef.current) return { nodes: [], edges: [] };
    const cy = cyRef.current;
    const nodes: DesignWorkspaceLayoutNode[] = cy
      .nodes()
      .toArray()
      .map((n) => {
        const id = String(n.id());
        const data = n.data();
        const fallback = stagedElementById.get(id);
        return {
          id,
          label: String(data?.label ?? fallback?.name ?? id),
          elementType: (data?.elementType ?? fallback?.type) as ObjectType,
          x: n.position('x'),
          y: n.position('y'),
        };
      });

    const edges: DesignWorkspaceLayoutEdge[] = cy
      .edges()
      .toArray()
      .map((e) => {
        const id = String(e.id());
        const data = e.data();
        const fallback = stagedRelationships.find((r) => r.id === id);
        return {
          id,
          source: String(data?.source ?? fallback?.fromId ?? ''),
          target: String(data?.target ?? fallback?.toId ?? ''),
          relationshipType: (data?.relationshipType ?? fallback?.type) as RelationshipType,
        };
      })
      .filter((e) => e.source && e.target && e.relationshipType);

    return { nodes, edges };
  }, [stagedElementById, stagedRelationships]);

  const buildLayoutFromView = React.useCallback(
    (view: ViewInstance): DesignWorkspaceLayout | null => {
      if (!eaRepository) return null;
      const resolution = resolveViewScope({ view, repository: eaRepository });
      const positions = loadViewLayoutPositions(view.id);
      const existingNodeMap = new Map((designWorkspace.layout?.nodes ?? []).map((n) => [n.id, n] as const));

      const nodes: DesignWorkspaceLayoutNode[] = resolution.elements.map((el, index) => {
        const saved = positions[el.id] ?? existingNodeMap.get(el.id);
        const fallbackX = 80 + (index % 4) * 180;
        const fallbackY = 80 + Math.floor(index / 4) * 140;
        return {
          id: el.id,
          label: ((el.attributes as any)?.name as string) || el.id,
          elementType: el.type,
          x: saved?.x ?? fallbackX,
          y: saved?.y ?? fallbackY,
        };
      });

      const nodeIdSet = new Set(nodes.map((n) => n.id));
      stagedElements.forEach((el, index) => {
        if (nodeIdSet.has(el.id)) return;
        const existing = existingNodeMap.get(el.id);
        const offset = nodes.length + index;
        const fallbackX = 80 + (offset % 4) * 180;
        const fallbackY = 80 + Math.floor(offset / 4) * 140;
        nodes.push({
          id: el.id,
          label: el.name || el.id,
          elementType: el.type,
          x: existing?.x ?? fallbackX,
          y: existing?.y ?? fallbackY,
        });
      });

      const edges: DesignWorkspaceLayoutEdge[] = resolution.relationships.map((rel) => ({
        id: rel.id ?? `${rel.fromId}__${rel.toId}__${rel.type}`,
        source: rel.fromId,
        target: rel.toId,
        relationshipType: rel.type,
      }));

      const edgeIdSet = new Set(edges.map((e) => e.id));
      stagedRelationships.forEach((rel) => {
        if (edgeIdSet.has(rel.id)) return;
        edges.push({
          id: rel.id,
          source: rel.fromId,
          target: rel.toId,
          relationshipType: rel.type,
        });
      });

      return { nodes, edges };
    },
    [designWorkspace.layout?.nodes, eaRepository, stagedElements, stagedRelationships],
  );

  React.useEffect(() => {
    if (pendingRelationshipType) return;
    setRelationshipDraft({ sourceId: null, targetId: null, valid: null, message: null, dragging: false });
  }, [pendingRelationshipType]);

  const stageElement = React.useCallback(
    (input: {
      type: ObjectType;
      name: string;
      description?: string;
      placement?: { x: number; y: number } | null;
      id?: string;
    }) => {
      const id = input.id ?? generateElementId(input.type);
      const createdAt = new Date().toISOString();
      const staged: DesignWorkspaceStagedElement = {
        id,
        kind: 'element',
        type: input.type,
        name: input.name,
        description: input.description,
        attributes: {},
        createdAt,
        createdBy: actor,
        modelingState: 'DRAFT',
        status: 'STAGED',
      };

      setStagedElements((prev) => [...prev, staged]);

      if (cyRef.current) {
        cyRef.current.add({
          data: { id, label: input.name, elementType: input.type, staged: true },
          position: input.placement ? { x: input.placement.x, y: input.placement.y } : undefined,
        });
        const node = cyRef.current.getElementById(id);
        if (node && !node.empty()) {
          node.grabbable(true);
          node.select();
        }
        setIsLargeGraph(cyRef.current.nodes().length > LARGE_GRAPH_THRESHOLD);
      }

      setSelectedEdgeId(null);
      setSelectedNodeIds([id]);

      return id;
    },
    [actor],
  );

  const stageExistingElement = React.useCallback(
    (elementId: string) => {
      if (!eaRepository) return;
      if (stagedElementById.has(elementId)) return;
      const existing = eaRepository.objects.get(elementId);
      if (!existing) {
        message.error('Selected element no longer exists in the repository.');
        return;
      }
      const attrs = { ...(existing.attributes ?? {}) } as Record<string, unknown>;
      const name = typeof attrs.name === 'string' && attrs.name.trim() ? attrs.name.trim() : existing.id;
      const description = typeof attrs.description === 'string' ? attrs.description : '';
      const createdAt = typeof attrs.createdAt === 'string' ? attrs.createdAt : new Date().toISOString();
      const createdBy = typeof attrs.createdBy === 'string' ? attrs.createdBy : actor;
      const modelingState = (attrs.modelingState as any) ?? 'DRAFT';

      const staged: DesignWorkspaceStagedElement = {
        id: existing.id,
        kind: 'element',
        type: existing.type as ObjectType,
        name,
        description,
        attributes: attrs,
        createdAt,
        createdBy,
        modelingState,
        status: 'STAGED',
      };

      setStagedElements((prev) => [...prev, staged]);

      if (cyRef.current) {
        const node = cyRef.current.getElementById(existing.id);
        if (node && !node.empty()) {
          node.data('staged', true);
          node.grabbable(true);
          node.select();
        }
      }

      setSelectedEdgeId(null);
      setSelectedNodeIds([existing.id]);
      message.success('Element staged for editing.');
    },
    [actor, eaRepository, stagedElementById],
  );

  const stageExistingRelationship = React.useCallback(
    (edgeId: string) => {
      if (!edgeId) return;
      if (stagedRelationships.some((rel) => rel.id === edgeId)) return;
      const resolved = resolveExistingRelationship(edgeId);
      if (!resolved) {
        message.error('Selected relationship could not be resolved.');
        return;
      }
      const attrs = { ...(resolved.attributes ?? {}) } as Record<string, unknown>;
      const createdAt = typeof attrs.createdAt === 'string' ? attrs.createdAt : new Date().toISOString();
      const createdBy = typeof attrs.createdBy === 'string' ? attrs.createdBy : actor;
      const modelingState = (attrs.modelingState as any) ?? 'DRAFT';

      const staged: DesignWorkspaceStagedRelationship = {
        id: resolved.id,
        kind: 'relationship',
        type: resolved.type,
        fromId: resolved.fromId,
        toId: resolved.toId,
        attributes: attrs,
        createdAt,
        createdBy,
        modelingState,
        status: 'STAGED',
      };

      setStagedRelationships((prev) => [...prev, staged]);

      if (cyRef.current) {
        const edge = cyRef.current.getElementById(edgeId);
        if (edge && !edge.empty()) {
          edge.data('staged', true);
          edge.select();
        }
      }

      setSelectedNodeIds([]);
      setSelectedEdgeId(edgeId);
      message.success('Relationship staged for editing.');
    },
    [actor, resolveExistingRelationship, stagedRelationships],
  );

  const confirmRelationshipDraft = React.useCallback(() => {
    if (!pendingRelationshipType || !relationshipSourceId || !relationshipTargetId) return;

    const createdAt = new Date().toISOString();
    const relationshipId = `rel-${generateUUID()}`;

    const staged: DesignWorkspaceStagedRelationship = {
      id: relationshipId,
      kind: 'relationship',
      fromId: relationshipSourceId,
      toId: relationshipTargetId,
      type: pendingRelationshipType,
      attributes: {},
      createdAt,
      createdBy: actor,
      modelingState: 'DRAFT',
      status: 'STAGED',
    };

    setStagedRelationships((prev) => [...prev, staged]);

    if (cyRef.current) {
      cyRef.current.add({
        data: {
          id: relationshipId,
          source: relationshipSourceId,
          target: relationshipTargetId,
          relationshipType: pendingRelationshipType,
          staged: true,
        },
      });
      const edge = cyRef.current.getElementById(relationshipId);
      if (edge && !edge.empty()) edge.select();
    }

    setSelectedNodeIds([]);
    setSelectedEdgeId(relationshipId);
    setRelationshipSourceId(null);
    setRelationshipTargetId(null);
    setRelationshipDraft({ sourceId: null, targetId: null, valid: null, message: null, dragging: false });
    const relDef = RELATIONSHIP_TYPE_DEFINITIONS[pendingRelationshipType];
    if (relDef?.attributes?.length) {
      message.info('Relationship staged. Provide required attributes in the Properties panel.');
    } else {
      message.success('Relationship staged in workspace.');
    }
  }, [actor, pendingRelationshipType, relationshipSourceId, relationshipTargetId]);

  const handleQuickCreate = React.useCallback(
    async (keepOpen: boolean) => {
      try {
        if (designWorkspace.status !== 'DRAFT') {
          message.warning('Workspace is read-only. Reopen draft to create elements.');
          return;
        }
        const values = await quickCreateForm.validateFields();
        const name = String(values.name || '').trim();
        if (!name) {
          message.error('Name is required.');
          return;
        }
        const type = values.type as ObjectType;
        if (!validateStudioElementType(type)) {
          return;
        }
        const id = stageElement({
          type,
          name,
          description: String(values.description || '').trim(),
          placement: quickCreatePlacement,
        });
        openPropertiesPanel({ elementId: id, elementType: type, dock: 'right', readOnly: false });
        message.success(`${type} staged in workspace.`);

        if (keepOpen) {
          quickCreateForm.setFieldsValue({ name: '', description: '' });
          return;
        }

        setQuickCreateOpen(false);
        setQuickCreatePlacement(null);
        setQuickCreateType(null);
        quickCreateForm.resetFields();
      } catch {
        // validation handled by Form
      }
    },
    [designWorkspace.status, openPropertiesPanel, quickCreateForm, quickCreatePlacement, stageElement, validateStudioElementType],
  );

  const updateWorkspaceStatus = React.useCallback(
    (status: DesignWorkspaceStatus) => {
      const layout = buildLayoutFromCanvas();
      const next: DesignWorkspace = {
        ...designWorkspace,
        status,
        updatedAt: new Date().toISOString(),
        layout,
        stagedElements,
        stagedRelationships,
      };
      onUpdateWorkspace(next);
    },
    [buildLayoutFromCanvas, designWorkspace, onUpdateWorkspace, stagedElements, stagedRelationships],
  );

  const discardWorkspaceNow = React.useCallback(() => {
    const nowIso = new Date().toISOString();
    const nextWorkspace: DesignWorkspace = {
      ...designWorkspace,
      status: 'DISCARDED',
      updatedAt: nowIso,
      layout: { nodes: [], edges: [] },
      stagedElements: [],
      stagedRelationships: [],
    };
    onUpdateWorkspace(nextWorkspace);
    recordAuditEvent({
      userId: actor,
      repositoryName: metadata?.repositoryName ?? designWorkspace.repositoryName,
      timestamp: nowIso,
      action: `workspace.discard name="${designWorkspace.name}"`,
    });
    setStagedElements([]);
    setStagedRelationships([]);
    if (cyRef.current) cyRef.current.elements().remove();
    setDiscardOpen(false);
    message.success('Workspace discarded. View unchanged.');
    onExit({ suppressRefresh: true });
  }, [actor, designWorkspace, metadata?.repositoryName, onExit, onUpdateWorkspace]);

  const saveWorkspaceDraft = React.useCallback(() => {
    if (designWorkspace.status === 'COMMITTED') {
      message.warning('Workspace is committed. Reopen draft to save new changes.');
      return;
    }
    const layout = buildLayoutFromCanvas();
    const next: DesignWorkspace = {
      ...designWorkspace,
      status: 'DRAFT',
      updatedAt: new Date().toISOString(),
      repositoryUpdatedAt: currentRepositoryUpdatedAt ?? designWorkspace.repositoryUpdatedAt,
      layout,
      stagedElements,
      stagedRelationships,
    };
    onUpdateWorkspace(next);
    message.success('Workspace saved (draft).');
  }, [buildLayoutFromCanvas, currentRepositoryUpdatedAt, designWorkspace, onUpdateWorkspace, stagedElements, stagedRelationships]);

  React.useEffect(() => {
    const onAction = (ev: Event) => {
      const e = ev as CustomEvent<{ requestId?: string; action?: 'save' | 'discard' }>;
      const requestId = e.detail?.requestId ?? '';
      const action = e.detail?.action;
      if (!action) return;

      if (action === 'save') {
        saveWorkspaceDraft();
        onExit({ suppressRefresh: true });
      }

      if (action === 'discard') {
        discardWorkspaceNow();
      }

      try {
        window.dispatchEvent(new CustomEvent('ea:studio.action.completed', { detail: { requestId, action } }));
      } catch {
        // ignore
      }
    };

    window.addEventListener('ea:studio.action', onAction as EventListener);
    return () => window.removeEventListener('ea:studio.action', onAction as EventListener);
  }, [discardWorkspaceNow, onExit, saveWorkspaceDraft]);

  const autoSaveWorkspace = React.useCallback(() => {
    if (designWorkspace.status === 'DISCARDED') return;
    const layout = buildLayoutFromCanvas();
    const next: DesignWorkspace = {
      ...designWorkspace,
      updatedAt: new Date().toISOString(),
      repositoryUpdatedAt: currentRepositoryUpdatedAt ?? designWorkspace.repositoryUpdatedAt,
      layout,
      stagedElements,
      stagedRelationships,
    };
    onUpdateWorkspace(next);
    setLastAutoSaveAt(next.updatedAt);
  }, [buildLayoutFromCanvas, currentRepositoryUpdatedAt, designWorkspace, onUpdateWorkspace, stagedElements, stagedRelationships]);

  const handleViewCreated = React.useCallback(
    (view: ViewInstance) => {
      const layout = buildLayoutFromView(view);
      setCreateViewModalOpen(false);
      if (!layout) {
        message.warning('View created, but repository is unavailable to load it into Studio.');
        return;
      }
      const next: DesignWorkspace = {
        ...designWorkspace,
        updatedAt: new Date().toISOString(),
        layout,
      };
      onUpdateWorkspace(next);
      setActiveViewName(view.name || view.id);
    },
    [buildLayoutFromView, designWorkspace, onUpdateWorkspace],
  );

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      autoSaveWorkspace();
    }, 60000);
    return () => window.clearInterval(interval);
  }, [autoSaveWorkspace]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase() ?? '';
      const isEditable = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
      if (isEditable && event.key !== 'Escape') return;

      if (event.key === 'Alt') {
        setSnapTemporarilyDisabled(true);
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        cancelCreation();
        setToolMode('SELECT');
        resetToolDrafts();
        return;
      }

      if (event.key.toLowerCase() === 'c') {
        if (designWorkspace.status !== 'DRAFT') return;
        event.preventDefault();
        const placement = getCanvasCenter();
        setQuickCreatePlacement(placement);
        setQuickCreateType(null);
        quickCreateForm.setFieldsValue({ type: undefined as any, name: '', description: '' });
        setQuickCreateOpen(true);
        return;
      }

      if (event.key === 'Delete') {
        if (selectedStagedElements.length > 0) {
          event.preventDefault();
          selectedStagedElements.forEach((el) => deleteStagedElement(el.id));
          return;
        }
        if (stagedSelectedRelationship) {
          event.preventDefault();
          deleteStagedRelationship(stagedSelectedRelationship.id);
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        setSnapTemporarilyDisabled(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [cancelCreation, deleteStagedElement, deleteStagedRelationship, designWorkspace.status, getCanvasCenter, quickCreateForm, resetToolDrafts, selectedStagedElements, stagedSelectedRelationship]);

  const commitWorkspace = React.useCallback(() => {
    if (!hasStagedChanges) {
      message.info('No staged changes to commit.');
      return;
    }

    if (!eaRepository) {
      message.error('No repository loaded. Commit is unavailable.');
      return;
    }

    if (!hasModelingAccess) {
      message.error('Commit blocked: repository is read-only or you lack modeling permission.');
      return;
    }

    if (commitContextLocked) {
      message.error('Commit blocked: Baseline, Plateau, and Roadmap contexts are read-only.');
      return;
    }

    if (stagedValidationErrors.length > 0) {
      Modal.error({
        title: 'Cannot commit workspace',
        content: (
          <div>
            <Typography.Paragraph type="secondary">
              Fix validation errors before committing.
            </Typography.Paragraph>
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              {stagedValidationErrors.slice(0, 6).map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>

        ),
      });
      return;
    }

    if (mandatoryCommitRelationshipErrors.length > 0) {
      Modal.error({
        title: 'Mandatory relationships required',
        content: (
          <div>
            <Typography.Paragraph type="secondary">
              Add required relationships before committing the workspace.
            </Typography.Paragraph>
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              {mandatoryCommitRelationshipErrors.slice(0, 8).map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
            {mandatoryCommitRelationshipErrors.length > 8 ? (
              <Typography.Text type="secondary">+{mandatoryCommitRelationshipErrors.length - 8} more</Typography.Text>
            ) : null}
          </div>
        ),
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const nextRepo = eaRepository.clone();

    const addedElements: DesignWorkspaceStagedElement[] = [];
    const modifiedElements: DesignWorkspaceStagedElement[] = [];
    const removedElements: DesignWorkspaceStagedElement[] = [];
    const addedRelationships: DesignWorkspaceStagedRelationship[] = [];
    const modifiedRelationships: DesignWorkspaceStagedRelationship[] = [];
    const removedRelationships: DesignWorkspaceStagedRelationship[] = [];

    const findRelationshipInRepo = (
      rel: DesignWorkspaceStagedRelationship,
      relationships: typeof nextRepo.relationships,
    ) => {
      return (
        relationships.find((r) => r.id === rel.id) ??
        relationships.find((r) => r.fromId === rel.fromId && r.toId === rel.toId && r.type === rel.type)
      );
    };

    const removeElementFromRepo = (elementId: string) => {
      nextRepo.objects.delete(elementId);
      nextRepo.relationships = nextRepo.relationships.filter((r) => r.fromId !== elementId && r.toId !== elementId);
    };

    for (const el of stagedElements) {
      const exists = nextRepo.objects.get(el.id);
      if (isMarkedForRemoval(el.attributes)) {
        if (exists) {
          removedElements.push(el);
          removeElementFromRepo(el.id);
        }
        continue;
      }

      const attrs: Record<string, unknown> = { ...(el.attributes ?? {}) };
      if (typeof el.name === 'string') attrs.name = el.name.trim();
      if (typeof el.description === 'string') attrs.description = el.description;
      if (!attrs.modelingState) attrs.modelingState = el.modelingState ?? 'DRAFT';

      if (!exists) {
        if (!attrs.createdAt) attrs.createdAt = el.createdAt || nowIso;
        if (!attrs.createdBy) attrs.createdBy = el.createdBy || actor;
        if (!attrs.lastModifiedAt) attrs.lastModifiedAt = attrs.createdAt;
        if (!attrs.lastModifiedBy) attrs.lastModifiedBy = attrs.createdBy;

        const res = nextRepo.addObject({ id: el.id, type: el.type, attributes: attrs });
        if (!res.ok) {
          Modal.error({
            title: 'Commit failed',
            content: `Element ${el.id}: ${res.error}`,
          });
          return;
        }
        addedElements.push(el);
        continue;
      }

      const existingAttrs = exists.attributes ?? {};
      const createdAt = typeof (existingAttrs as any)?.createdAt === 'string' ? (existingAttrs as any).createdAt : (attrs.createdAt ?? el.createdAt ?? nowIso);
      const createdBy = typeof (existingAttrs as any)?.createdBy === 'string' ? (existingAttrs as any).createdBy : (attrs.createdBy ?? el.createdBy ?? actor);
      attrs.createdAt = createdAt;
      attrs.createdBy = createdBy;

      if (!areAttributesEqual(existingAttrs, attrs)) {
        attrs.lastModifiedAt = nowIso;
        attrs.lastModifiedBy = actor;
        const res = nextRepo.updateObjectAttributes(el.id, attrs, 'replace');
        if (!res.ok) {
          Modal.error({
            title: 'Commit failed',
            content: `Element ${el.id}: ${res.error}`,
          });
          return;
        }
        modifiedElements.push(el);
      }
    }

    const removedElementIds = new Set(removedElements.map((el) => el.id));

    for (const rel of stagedRelationships) {
      if (removedElementIds.has(rel.fromId) || removedElementIds.has(rel.toId)) {
        continue;
      }
      if (isMarkedForRemoval(rel.attributes)) {
        const existing = findRelationshipInRepo(rel, nextRepo.relationships);
        if (existing) {
          nextRepo.relationships = nextRepo.relationships.filter((r) => r.id !== existing.id);
          removedRelationships.push(rel);
        }
        continue;
      }

      const existing = findRelationshipInRepo(rel, nextRepo.relationships);
      const attrs: Record<string, unknown> = { ...(rel.attributes ?? {}) };
      if (!attrs.modelingState) attrs.modelingState = rel.modelingState ?? 'DRAFT';

      if (!existing) {
        if (!attrs.createdAt) attrs.createdAt = rel.createdAt || nowIso;
        if (!attrs.createdBy) attrs.createdBy = rel.createdBy || actor;
        if (!attrs.lastModifiedAt) attrs.lastModifiedAt = attrs.createdAt;
        if (!attrs.lastModifiedBy) attrs.lastModifiedBy = attrs.createdBy;

        const res = nextRepo.addRelationship({
          id: rel.id,
          fromId: rel.fromId,
          toId: rel.toId,
          type: rel.type,
          attributes: attrs,
        });
        if (!res.ok) {
          Modal.error({
            title: 'Commit failed',
            content: `Relationship ${rel.id}: ${res.error}`,
          });
          return;
        }
        addedRelationships.push(rel);
        continue;
      }

      const existingAttrs = existing.attributes ?? {};
      const createdAt = typeof (existingAttrs as any)?.createdAt === 'string' ? (existingAttrs as any).createdAt : (attrs.createdAt ?? rel.createdAt ?? nowIso);
      const createdBy = typeof (existingAttrs as any)?.createdBy === 'string' ? (existingAttrs as any).createdBy : (attrs.createdBy ?? rel.createdBy ?? actor);
      attrs.createdAt = createdAt;
      attrs.createdBy = createdBy;

      if (!areAttributesEqual(existingAttrs, attrs)) {
        attrs.lastModifiedAt = nowIso;
        attrs.lastModifiedBy = actor;
        const nextRel = {
          ...existing,
          attributes: { ...attrs },
        };
        const index = nextRepo.relationships.findIndex((r) => r.id === existing.id);
        if (index >= 0) {
          nextRepo.relationships[index] = nextRel;
        }
        modifiedRelationships.push(rel);
      }
    }

    const changeCount =
      addedElements.length +
      modifiedElements.length +
      removedElements.length +
      addedRelationships.length +
      modifiedRelationships.length +
      removedRelationships.length;

    if (changeCount === 0) {
      message.info('No actual changes detected. Commit skipped.');
      return;
    }

    const applied = trySetEaRepository(nextRepo);
    if (!applied.ok) {
      Modal.error({
        title: 'Commit failed',
        content: `Repository update blocked: ${applied.error}`,
      });
      return;
    }

    recordAuditEvent({
      userId: actor,
      repositoryName: metadata?.repositoryName ?? designWorkspace.repositoryName,
      timestamp: nowIso,
      action: `workspace.commit name="${designWorkspace.name}" added=${addedElements.length + addedRelationships.length} modified=${modifiedElements.length + modifiedRelationships.length} removed=${removedElements.length + removedRelationships.length}`,
    });

    addedElements.forEach((el) => {
      recordAuditEvent({
        userId: actor,
        repositoryName: metadata?.repositoryName ?? designWorkspace.repositoryName,
        timestamp: nowIso,
        action: `workspace.commit.add element id="${el.id}" type="${el.type}"`,
      });
    });

    modifiedElements.forEach((el) => {
      recordAuditEvent({
        userId: actor,
        repositoryName: metadata?.repositoryName ?? designWorkspace.repositoryName,
        timestamp: nowIso,
        action: `workspace.commit.modify element id="${el.id}" type="${el.type}"`,
      });
    });

    removedElements.forEach((el) => {
      recordAuditEvent({
        userId: actor,
        repositoryName: metadata?.repositoryName ?? designWorkspace.repositoryName,
        timestamp: nowIso,
        action: `workspace.commit.remove element id="${el.id}" type="${el.type}"`,
      });
    });

    addedRelationships.forEach((rel) => {
      recordAuditEvent({
        userId: actor,
        repositoryName: metadata?.repositoryName ?? designWorkspace.repositoryName,
        timestamp: nowIso,
        action: `workspace.commit.add relationship id="${rel.id}" type="${rel.type}" from="${rel.fromId}" to="${rel.toId}"`,
      });
    });

    modifiedRelationships.forEach((rel) => {
      recordAuditEvent({
        userId: actor,
        repositoryName: metadata?.repositoryName ?? designWorkspace.repositoryName,
        timestamp: nowIso,
        action: `workspace.commit.modify relationship id="${rel.id}" type="${rel.type}" from="${rel.fromId}" to="${rel.toId}"`,
      });
    });

    removedRelationships.forEach((rel) => {
      recordAuditEvent({
        userId: actor,
        repositoryName: metadata?.repositoryName ?? designWorkspace.repositoryName,
        timestamp: nowIso,
        action: `workspace.commit.remove relationship id="${rel.id}" type="${rel.type}" from="${rel.fromId}" to="${rel.toId}"`,
      });
    });

    const layout = buildLayoutFromCanvas();
    const nextWorkspace: DesignWorkspace = {
      ...designWorkspace,
      status: 'COMMITTED',
      updatedAt: nowIso,
      repositoryUpdatedAt: nowIso,
      layout,
      stagedElements: stagedElements.map((el) => ({ ...el, status: 'COMMITTED' })),
      stagedRelationships: stagedRelationships.map((rel) => ({ ...rel, status: 'COMMITTED' })),
    };

    onUpdateWorkspace(nextWorkspace);
    setCommitOpen(false);
    message.success('Workspace committed and locked.');
    message.success('View updated from committed workspace changes.');
    try {
      window.dispatchEvent(new Event('ea:repositoryChanged'));
      window.dispatchEvent(new Event('ea:relationshipsChanged'));
      window.dispatchEvent(new Event('ea:viewsChanged'));
    } catch {
      // Best-effort only.
    }
  }, [actor, buildLayoutFromCanvas, commitContextLocked, designWorkspace, eaRepository, hasModelingAccess, hasStagedChanges, metadata?.repositoryName, onUpdateWorkspace, stagedElements, stagedRelationships, stagedValidationErrors, trySetEaRepository]);

  React.useEffect(() => {
    if (!containerRef.current) return undefined;

    if (!cyRef.current) {
      cyRef.current = cytoscape({
        container: containerRef.current,
        elements: [],
        layout: { name: 'grid', fit: true, avoidOverlap: true } as const,
        style: [
          {
            selector: 'node',
            style: {
              label: 'data(label)',
              'text-valign': 'center',
              'text-halign': 'center',
              'background-color': '#f0f0f0',
              color: '#1f1f1f',
              'border-color': '#d9d9d9',
              'border-width': 1,
              'font-size': 11,
              'font-weight': 600,
              width: 120,
              height: 48,
              shape: 'round-rectangle',
            },
          },
          ...TECHNOLOGY_VISUALS.map((entry) => ({
            selector: `node[elementType = "${entry.type}"]`,
            style: {
              'background-color': entry.color,
              'border-color': entry.border,
              'background-image': entry.icon,
              'background-fit': 'contain',
              'background-width': 16,
              'background-height': 16,
              'background-position-x': 8,
              'background-position-y': '50%',
              'text-margin-x': 8,
            },
          })),
          {
            selector: 'edge',
            style: {
              width: 1.5,
              'line-color': '#8c8c8c',
              'target-arrow-color': '#8c8c8c',
              'target-arrow-shape': 'vee',
              'curve-style': 'bezier',
              label: 'data(relationshipType)',
              'font-size': 8,
              'text-background-color': '#fff',
              'text-background-opacity': 0.7,
              'text-rotation': 'autorotate',
            },
          },
          {
            selector: 'node[staged]',
            style: {
              'border-color': '#fa8c16',
              'border-width': 2,
              'border-style': 'dashed',
              'background-color': '#fff7e6',
              color: '#ad4e00',
            },
          },
          {
            selector: 'node.layerHidden',
            style: {
              display: 'none',
            },
          },
          {
            selector: 'edge.layerHidden',
            style: {
              display: 'none',
            },
          },
          {
            selector: 'edge[staged]',
            style: {
              'line-color': '#fa8c16',
              'target-arrow-color': '#fa8c16',
              'line-style': 'dashed',
              'font-weight': 700,
            },
          },
          {
            selector: 'edge[draft]',
            style: {
              'line-color': '#91caff',
              'target-arrow-color': '#91caff',
              'line-style': 'dashed',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
            },
          },
          {
            selector: 'node.validTarget',
            style: {
              'border-color': '#52c41a',
              'border-width': 2,
              'border-style': 'solid',
            },
          },
          {
            selector: 'node[draftTarget]',
            style: {
              opacity: 0,
              width: 1,
              height: 1,
              'border-width': 0,
            },
          },
        ],
        userZoomingEnabled: true,
        userPanningEnabled: true,
        boxSelectionEnabled: true,
        autounselectify: false,
        autoungrabify: false,
      });
    }

    const applyToolMode = () => {
      if (!cyRef.current) return;
      const cy = cyRef.current;
      const panEnabled = toolMode === 'PAN';
      const selectEnabled = toolMode === 'SELECT';
      cy.userPanningEnabled(panEnabled);
      cy.boxSelectionEnabled(selectEnabled);
      cy.autoungrabify(panEnabled);
    };

    applyToolMode();


    const handleTap = (evt: any) => {
      if (!cyRef.current) return;

      if (toolMode === 'CREATE_ELEMENT' && suppressNextTapRef.current) {
        suppressNextTapRef.current = false;
        return;
      }

      if (toolMode === 'CREATE_ELEMENT' && pendingElementType && placementModeActive && evt.target === cyRef.current) {
        if (!validateStudioElementType(pendingElementType)) return;
        const pos = evt.position ?? evt.cyPosition ?? { x: 0, y: 0 };
        const draftId = `draft-${generateUUID()}`;
        const name = `New ${pendingElementType}`;
        const id = stageElement({
          id: draftId,
          type: pendingElementType,
          name,
          description: '',
          placement: { x: pos.x, y: pos.y },
        });
        openPropertiesPanel({ elementId: id, elementType: pendingElementType, dock: 'right', readOnly: false });
        setToolMode('SELECT');
        resetToolDrafts();
        return;
      }

      if (toolMode === 'CREATE_RELATIONSHIP' && pendingRelationshipType && evt.target !== cyRef.current && !relationshipDraft.dragging) {
        const node = evt.target;
        const id = String(node.id());
        if (!id) return;

        if (!relationshipSourceId) {
          setRelationshipSourceId(id);
          setRelationshipDraft({
            sourceId: id,
            targetId: null,
            valid: null,
            message: 'Source selected. Choose a target to validate.',
            dragging: false,
          });
          return;
        }

        if (relationshipSourceId === id) return;

        const validation = validateRelationshipEndpoints(relationshipSourceId, id, pendingRelationshipType);
        if (!validation.valid) {
          // Reject invalid combinations silently.
          setRelationshipSourceId(null);
          setRelationshipTargetId(null);
          return;
        }

        setRelationshipTargetId(id);
        setRelationshipDraft({
          sourceId: relationshipSourceId,
          targetId: id,
          valid: true,
          message: 'Target selected. Confirm or cancel to continue.',
          dragging: false,
        });
      }
    };

    const handleDragStart = (evt: any) => {
      if (!cyRef.current) return;
      if (toolMode !== 'CREATE_RELATIONSHIP' || !pendingRelationshipType) return;
      const node = evt.target;
      if (!node || node === cyRef.current) return;
      const sourceId = String(node.id());
      if (!sourceId) return;
      const cy = cyRef.current;
      const validTargets = getValidTargetsForSource(sourceId, pendingRelationshipType);

      cy.nodes().forEach((n) => {
        const id = String(n.id());
        if (id === sourceId) return;
        n.removeClass('validTarget');
        n.removeClass('invalidTarget');
        if (validTargets.has(id)) n.addClass('validTarget');
      });

      if (cy.getElementById(DRAFT_TARGET_ID).empty()) {
        cy.add({ data: { id: DRAFT_TARGET_ID, draftTarget: true }, position: node.position(), classes: '' });
      }
      if (cy.getElementById(DRAFT_EDGE_ID).empty()) {
        cy.add({
          data: {
            id: DRAFT_EDGE_ID,
            source: sourceId,
            target: DRAFT_TARGET_ID,
            draft: true,
          },
        });
      } else {
        const edge = cy.getElementById(DRAFT_EDGE_ID);
        edge.data('source', sourceId);
        edge.data('target', DRAFT_TARGET_ID);
      }
      setRelationshipSourceId(sourceId);
      setRelationshipTargetId(null);
      setRelationshipDraft({
        sourceId,
        targetId: null,
        valid: null,
        message: 'Drag to a target element to validate.',
        dragging: true,
      });
    };

    const handleDragOverNode = (evt: any) => {
      if (toolMode !== 'CREATE_RELATIONSHIP' || !pendingRelationshipType) return;
      if (!relationshipDraft.dragging || !relationshipDraft.sourceId) return;
      const node = evt.target;
      if (!node || node === cyRef.current) return;
      const targetId = String(node.id());
      if (!targetId || targetId === relationshipDraft.sourceId) return;
      if (!node.hasClass('validTarget')) return;
      const validation = validateRelationshipEndpoints(relationshipDraft.sourceId, targetId, pendingRelationshipType);
      setRelationshipDraft({
        sourceId: relationshipDraft.sourceId,
        targetId,
        valid: validation.valid,
        message: validation.message,
        dragging: true,
      });
    };

    const handleDragEnd = (evt: any) => {
      if (toolMode !== 'CREATE_RELATIONSHIP' || !pendingRelationshipType) return;
      if (!relationshipDraft.dragging || !relationshipDraft.sourceId) return;
      const node = evt.target;
      if (!node || node === cyRef.current) {
        setRelationshipDraft({ sourceId: null, targetId: null, valid: null, message: null, dragging: false });
        setRelationshipSourceId(null);
        setRelationshipTargetId(null);
        cyRef.current?.getElementById(DRAFT_EDGE_ID)?.remove();
        cyRef.current?.getElementById(DRAFT_TARGET_ID)?.remove();
        cyRef.current?.nodes().removeClass('validTarget').removeClass('invalidTarget');
        return;
      }

      const targetId = String(node.id());
      if (!targetId || targetId === relationshipDraft.sourceId) {
        setRelationshipDraft({ sourceId: null, targetId: null, valid: null, message: null, dragging: false });
        setRelationshipSourceId(null);
        setRelationshipTargetId(null);
        cyRef.current?.getElementById(DRAFT_EDGE_ID)?.remove();
        cyRef.current?.getElementById(DRAFT_TARGET_ID)?.remove();
        cyRef.current?.nodes().removeClass('validTarget').removeClass('invalidTarget');
        return;
      }

      if (!node.hasClass('validTarget')) {
        setRelationshipDraft({
          sourceId: relationshipDraft.sourceId,
          targetId,
          valid: false,
          message: 'Target is not valid for this relationship type.',
          dragging: false,
        });
        cyRef.current?.getElementById(DRAFT_EDGE_ID)?.remove();
        cyRef.current?.getElementById(DRAFT_TARGET_ID)?.remove();
        cyRef.current?.nodes().removeClass('validTarget').removeClass('invalidTarget');
        return;
      }

      const validation = validateRelationshipEndpoints(relationshipDraft.sourceId, targetId, pendingRelationshipType);
      if (!validation.valid) {
        setRelationshipDraft({
          sourceId: relationshipDraft.sourceId,
          targetId,
          valid: false,
          message: validation.message,
          dragging: false,
        });
        cyRef.current?.getElementById(DRAFT_EDGE_ID)?.remove();
        cyRef.current?.getElementById(DRAFT_TARGET_ID)?.remove();
        cyRef.current?.nodes().removeClass('validTarget').removeClass('invalidTarget');
        return;
      }

      setRelationshipDraft({
        sourceId: relationshipDraft.sourceId,
        targetId,
        valid: true,
        message: 'Target selected. Confirm or cancel to continue.',
        dragging: false,
      });
      cyRef.current?.getElementById(DRAFT_EDGE_ID)?.remove();
      cyRef.current?.getElementById(DRAFT_TARGET_ID)?.remove();
      cyRef.current?.nodes().removeClass('validTarget').removeClass('invalidTarget');
      setRelationshipTargetId(targetId);
    };

    const handleDragCancel = () => {
      if (!relationshipDraft.dragging) return;
      setRelationshipDraft({ sourceId: null, targetId: null, valid: null, message: null, dragging: false });
      cyRef.current?.getElementById(DRAFT_EDGE_ID)?.remove();
      cyRef.current?.getElementById(DRAFT_TARGET_ID)?.remove();
      cyRef.current?.nodes().removeClass('validTarget').removeClass('invalidTarget');
    };

    const handleMouseMove = (evt: any) => {
      if (!relationshipDraft.dragging) return;
      if (!cyRef.current) return;
      const pos = evt.position ?? evt.cyPosition;
      if (!pos) return;
      const target = cyRef.current.getElementById(DRAFT_TARGET_ID);
      if (!target.empty()) target.position({ x: pos.x, y: pos.y });
    };

    const handleNodeDrag = (evt: any) => {
      if (!cyRef.current) return;
      const node = evt.target;
      if (!node || node === cyRef.current) return;
      if (!iterativeModeling && !node.data('staged')) return;
      if (isLargeGraph) {
        const now = Date.now();
        if (now - dragThrottleRef.current < DRAG_THROTTLE_MS) return;
        dragThrottleRef.current = now;
        setAlignmentGuides({ x: null, y: null });
        return;
      }
      const guide = getAlignmentGuideForNode(String(node.id()));
      setAlignmentGuides({ x: guide.x, y: guide.y });
    };

    const handleNodeDragFree = (evt: any) => {
      if (!cyRef.current) return;
      const node = evt.target;
      if (!node || node === cyRef.current) return;
      if (!iterativeModeling && !node.data('staged')) return;
      if (snapTemporarilyDisabled) {
        setAlignmentGuides({ x: null, y: null });
        return;
      }
      const selected = cyRef.current.nodes(':selected');
      if (selected.length > 1) {
        selected.forEach((n) => {
          if (!iterativeModeling && !n.data('staged')) return;
          snapPosition(String(n.id()));
        });
      } else {
        snapPosition(String(node.id()));
      }
      setAlignmentGuides({ x: null, y: null });
    };

    const handleDoubleTap = (evt: any) => {
      if (!cyRef.current) return;
      if (evt.target !== cyRef.current) return;
      if (designWorkspace.status !== 'DRAFT') {
        message.warning('Workspace is read-only. Reopen draft to create elements.');
        return;
      }
      const pos = evt.position ?? evt.cyPosition ?? { x: 0, y: 0 };
      setQuickCreatePlacement({ x: pos.x, y: pos.y });
      setQuickCreateType(null);
      quickCreateForm.setFieldsValue({
        type: undefined as any,
        name: '',
        description: '',
      });
      setQuickCreateOpen(true);
    };

    const handleSelectionChange = () => {
      if (!cyRef.current) return;
      const selected = cyRef.current.nodes(':selected').map((n) => String(n.id()));
      setSelectedNodeIds(selected);
      const selectedEdges = cyRef.current.edges(':selected').map((e) => String(e.id()));
      setSelectedEdgeId(selectedEdges.length ? selectedEdges[0] : null);
    };

    cyRef.current.on('tap', handleTap);
    cyRef.current.on('drag', 'node', handleNodeDrag);
    cyRef.current.on('dragfree', 'node', handleNodeDragFree);
    cyRef.current.on('mousedown', 'node', handleDragStart);
    cyRef.current.on('tapstart', 'node', handleDragStart);
    cyRef.current.on('mouseover', 'node', handleDragOverNode);
    cyRef.current.on('mouseup', 'node', handleDragEnd);
    cyRef.current.on('tapend', 'node', handleDragEnd);
    cyRef.current.on('mouseup', handleDragCancel);
    cyRef.current.on('tapend', handleDragCancel);
    cyRef.current.on('mousemove', handleMouseMove);
    cyRef.current.on('dbltap', handleDoubleTap);
    cyRef.current.on('dblclick', handleDoubleTap);
    cyRef.current.on('select unselect', 'node', handleSelectionChange);
    cyRef.current.on('select unselect', 'edge', handleSelectionChange);

    return () => {
      cyRef.current?.removeListener('tap', handleTap);
      cyRef.current?.removeListener('drag', 'node', handleNodeDrag);
      cyRef.current?.removeListener('dragfree', 'node', handleNodeDragFree);
      cyRef.current?.removeListener('mousedown', handleDragStart);
      cyRef.current?.removeListener('tapstart', handleDragStart);
      cyRef.current?.removeListener('mouseover', handleDragOverNode);
      cyRef.current?.removeListener('mouseup', handleDragEnd);
      cyRef.current?.removeListener('tapend', handleDragEnd);
      cyRef.current?.removeListener('mouseup', handleDragCancel);
      cyRef.current?.removeListener('tapend', handleDragCancel);
      cyRef.current?.removeListener('mousemove', handleMouseMove);
      cyRef.current?.removeListener('dbltap', handleDoubleTap);
      cyRef.current?.removeListener('dblclick', handleDoubleTap);
      cyRef.current?.removeListener('select unselect', 'node', handleSelectionChange);
      cyRef.current?.removeListener('select unselect', 'edge', handleSelectionChange);
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [designWorkspace.status, getAlignmentGuideForNode, getValidTargetsForSource, isLargeGraph, iterativeModeling, openPropertiesPanel, pendingElementType, pendingRelationshipType, quickCreateForm, relationshipDraft.dragging, relationshipDraft.sourceId, resolveElementLabel, snapPosition, toolMode, validateRelationshipEndpoints]);

  React.useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    const panEnabled = toolMode === 'PAN';
    const selectEnabled = toolMode === 'SELECT';
    cy.userPanningEnabled(panEnabled);
    cy.boxSelectionEnabled(selectEnabled);
    cy.autoungrabify(panEnabled);
  }, [toolMode]);

  React.useEffect(() => {
    applyLayerVisibility();
  }, [applyLayerVisibility, stagedElements, stagedRelationships]);

  React.useEffect(() => {
    setStagedElements(designWorkspace.stagedElements ?? []);
    setStagedRelationships(designWorkspace.stagedRelationships ?? []);
    if (!cyRef.current) return;
    try {
      const workspace: DesignWorkspace = {
        ...designWorkspace,
        stagedElements: designWorkspace.stagedElements ?? [],
        stagedRelationships: designWorkspace.stagedRelationships ?? [],
      };
      const cy = cyRef.current;
      cy.elements().remove();
      const nodes = workspace.layout?.nodes ?? workspace.stagedElements.map((el, index) => ({
        id: el.id,
        label: el.name,
        elementType: el.type,
        x: 80 + (index % 3) * 160,
        y: 80 + Math.floor(index / 3) * 120,
      }));
      const edges = workspace.layout?.edges ?? workspace.stagedRelationships.map((rel) => ({
        id: rel.id,
        source: rel.fromId,
        target: rel.toId,
        relationshipType: rel.type,
      }));
      const stagedRelationshipIdSet = new Set(workspace.stagedRelationships.map((rel) => rel.id));
      nodes.forEach((n) => {
        const isStaged = stagedElementById.has(n.id);
        cy.add({
          data: { id: n.id, label: n.label, elementType: n.elementType, staged: isStaged },
          position: { x: n.x, y: n.y },
        });
        const node = cy.getElementById(n.id);
        if (node && !node.empty()) {
          node.grabbable(Boolean(isStaged) || iterativeModeling);
        }
      });
      edges.forEach((e) => {
        const isStaged = stagedRelationshipIdSet.has(e.id);
        cy.add({
          data: { id: e.id, source: e.source, target: e.target, relationshipType: e.relationshipType, staged: isStaged },
        });
      });
      setIsLargeGraph(cy.nodes().length > LARGE_GRAPH_THRESHOLD);
      if (!workspace.layout?.nodes?.length && nodes.length > 0) {
        cy.layout({ name: 'grid', fit: true, avoidOverlap: true }).run();
      }
      applyLayerVisibility();
    } catch {
      message.error('Workspace load failed. Staged items were not applied.');
      cyRef.current?.elements().remove();
    }
  }, [applyLayerVisibility, designWorkspace, iterativeModeling, stagedElementById]);

  const handleExit = React.useCallback(() => {
    if (stagedElements.length > 0 || stagedRelationships.length > 0) {
      Modal.confirm({
        title: 'Exit Studio with uncommitted changes?',
        content: 'Choose how to handle your draft workspace before leaving Studio.',
        okText: 'Save Workspace',
        cancelText: 'Cancel',
        okButtonProps: { type: 'primary' },
        onOk: () => {
          saveWorkspaceDraft();
          onExit();
        },
        onCancel: () => {
          // Cancel exit
        },
        footer: (_, { OkBtn, CancelBtn }) => (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button
              type="primary"
              disabled={commitDisabled}
              onClick={() => {
                setCommitOpen(true);
                Modal.destroyAll();
              }}
            >
              Commit Workspace
            </Button>
            <Button
              danger
              onClick={() => {
                setDiscardOpen(true);
                Modal.destroyAll();
              }}
            >
              Discard Workspace
            </Button>
            <CancelBtn />
            <OkBtn />
          </div>
        ),
      });
      return;
    }

    setPendingElementType(null);
    setPlacement(null);
    setCreateModalOpen(false);
    setAuditPreviewOpen(false);
    setPendingElementDraft(null);
    setPendingRelationshipType(null);
    setRelationshipSourceId(null);
    setRelationshipTargetId(null);
    setPlacementModeActive(false);
    setPlacementGuide(null);
    form.resetFields();
    onExit();
  }, [form, onExit, saveWorkspaceDraft, stagedElements.length, stagedRelationships.length]);

  const canConfirmRelationship =
    Boolean(pendingRelationshipType && relationshipSourceId && relationshipTargetId && relationshipDraft.valid);

  const governance = React.useMemo(() => {
    if (!eaRepository) return null;
    try {
      return buildGovernanceDebt(eaRepository, new Date(), {
        lifecycleCoverage: metadata?.lifecycleCoverage ?? null,
        governanceMode: metadata?.governanceMode ?? null,
      });
    } catch {
      return null;
    }
  }, [eaRepository, metadata?.governanceMode, metadata?.lifecycleCoverage]);

  const validationSummary = React.useMemo(() => {
    if (!governance) return null;
    const repoFindings = governance.repoReport.findings ?? [];
    const relFindings = governance.relationshipReport.findings ?? [];
    const isErrorSeverity = (sev?: string) => sev === 'ERROR' || sev === 'BLOCKER';
    const isWarningSeverity = (sev?: string) => sev === 'WARNING';
    const isInfoSeverity = (sev?: string) => sev === 'INFO';
    const errors = [...repoFindings, ...relFindings].filter((f) => isErrorSeverity(f.severity));
    const warnings = [...repoFindings, ...relFindings].filter((f) => isWarningSeverity(f.severity));
    const infos = [...repoFindings, ...relFindings].filter((f) => isInfoSeverity(f.severity));
    const issueErrors = (
      (governance.invalidRelationshipInserts ?? []).filter((issue) => isErrorSeverity(issue.severity))
    ).map((issue) => `Relationship insert: ${issue.message}`);
    const issueWarnings = (
      (governance.invalidRelationshipInserts ?? []).filter((issue) => isWarningSeverity(issue.severity))
    ).map((issue) => `Relationship insert: ${issue.message}`);
    const issueInfos = (
      (governance.invalidRelationshipInserts ?? []).filter((issue) => isInfoSeverity(issue.severity))
    ).map((issue) => `Relationship insert: ${issue.message}`);
    const lifecycleErrorIssues = (
      (governance.lifecycleTagMissingIds ?? []).filter((issue) => isErrorSeverity(issue.severity))
    ).map((issue) => `Lifecycle tag missing: ${issue.id}`);
    const lifecycleWarningIssues = (
      (governance.lifecycleTagMissingIds ?? []).filter((issue) => isWarningSeverity(issue.severity))
    ).map((issue) => `Lifecycle tag missing: ${issue.id}`);
    const lifecycleInfoIssues = (
      (governance.lifecycleTagMissingIds ?? []).filter((issue) => isInfoSeverity(issue.severity))
    ).map((issue) => `Lifecycle tag missing: ${issue.id}`);
    const extraErrors = issueErrors.length + lifecycleErrorIssues.length;
    const extraWarnings = issueWarnings.length + lifecycleWarningIssues.length;
    const extraInfos = issueInfos.length + lifecycleInfoIssues.length;

    const errorMessages = [...errors.map((f) => f.message), ...issueErrors, ...lifecycleErrorIssues];
    const warningMessages = [...warnings.map((f) => f.message), ...issueWarnings, ...lifecycleWarningIssues];
    const infoMessages = [...infos.map((f) => f.message), ...issueInfos, ...lifecycleInfoIssues];

    if (iterativeModeling) {
      const guidance = [...errorMessages, ...warningMessages, ...infoMessages];
      return {
        errorCount: 0,
        warningCount: 0,
        infoCount: guidance.length,
        errorHighlights: [],
        warningHighlights: [],
        infoHighlights: guidance.slice(0, 3),
      };
    }

    return {
      errorCount: errors.length + extraErrors,
      warningCount: warnings.length + extraWarnings,
      infoCount: infos.length + extraInfos,
      errorHighlights: errorMessages.slice(0, 3),
      warningHighlights: warningMessages.slice(0, 3),
      infoHighlights: infoMessages.slice(0, 3),
    };
  }, [governance, iterativeModeling]);

  React.useEffect(() => {
    try {
      localStorage.setItem(guidanceIgnoreStorageKey, JSON.stringify(ignoredGuidance));
    } catch {
      // Best-effort only.
    }
  }, [guidanceIgnoreStorageKey, ignoredGuidance]);

  const GUIDANCE_RULE_LABELS: Record<string, string> = {
    CAPABILITY_MISSING_OWNER: 'Capabilities missing owner',
    APPLICATION_MISSING_LIFECYCLE: 'Applications missing lifecycle',
    TECHNOLOGY_PAST_SUPPORT_END_DATE: 'Technology past support end date',
    APPLICATION_DEPENDS_ON_SELF: 'Application depends on itself',
    APPLICATION_DEPENDENCY_MISSING_STRENGTH: 'Application dependency missing strength',
    PROGRAMME_IMPACTS_RETIRED_ELEMENT: 'Programme impacts retired element',
    PROCESS_MISSING_CAPABILITY_PARENT: 'Process missing capability parent',
    EA_REQUIRED_OWNER: 'Missing owner',
    EA_INVALID_OWNER: 'Invalid owner',
    EA_ENTERPRISE_OWNERSHIP: 'Enterprise ownership required',
    EA_DEPARTMENT_REQUIRES_ENTERPRISE: 'Department requires enterprise',
    EA_BUSINESS_SERVICE_REQUIRES_CAPABILITY: 'Business service missing capability',
    EA_CAPABILITY_REQUIRES_APPLICATION_SERVICE_SUPPORT: 'Capability missing application service support',
    EA_APPLICATION_SERVICE_REQUIRES_APPLICATION: 'Application service missing application',
    EA_REQUIRED_NAME: 'Missing name',
    EA_FORBIDDEN_TECHNOLOGY_BUSINESS_LINK: 'Forbidden technology-business link',
    RELATIONSHIP_INSERT: 'Relationship insert issues',
    LIFECYCLE_TAG: 'Lifecycle tag missing',
  };

  const extractGuidanceCount = (message: string): number => {
    const match = message.match(/:\s*(\d+)\s/);
    if (!match) return 1;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : 1;
  };

  const extractGuidanceScope = (message: string): string | null => {
    const idx = message.indexOf(':');
    if (idx <= 0) return null;
    return message.slice(0, idx).trim();
  };

  const resolveGuidanceLabel = (checkId?: string, message?: string): string => {
    const base = (checkId && GUIDANCE_RULE_LABELS[checkId]) || checkId || 'Guidance';
    const scope = message ? extractGuidanceScope(message) : null;
    if (!scope || scope === 'Unknown') return base;
    if (base.toLowerCase().includes(scope.toLowerCase())) return base;
    return `${scope} · ${base}`;
  };

  type GuidanceItem = {
    id: string;
    ruleKey: string;
    ruleLabel: string;
    detail: string;
    count: number;
  };

  const guidanceItems = React.useMemo(() => {
    if (!governance) return [] as GuidanceItem[];
    const items: GuidanceItem[] = [];

    const shouldInclude = (severity?: string) => iterativeModeling || severity === 'INFO';
    const pushItem = (ruleKey: string, ruleLabel: string, detail: string, severity?: string) => {
      if (!shouldInclude(severity)) return;
      items.push({
        id: detail,
        ruleKey,
        ruleLabel,
        detail,
        count: extractGuidanceCount(detail),
      });
    };

    governance.repoReport.findings.forEach((f) => {
      const checkId = String((f as any).checkId ?? 'REPO');
      pushItem(checkId, resolveGuidanceLabel(checkId, f.message), f.message, f.severity);
    });
    governance.relationshipReport.findings.forEach((f) => {
      const checkId = String((f as any).checkId ?? 'RELATIONSHIP');
      pushItem(checkId, resolveGuidanceLabel(checkId, f.message), f.message, f.severity);
    });
    governance.invalidRelationshipInserts.forEach((issue) => {
      const ruleKey = 'RELATIONSHIP_INSERT';
      pushItem(ruleKey, resolveGuidanceLabel(ruleKey, issue.message), issue.message, issue.severity);
    });
    governance.lifecycleTagMissingIds.forEach((issue) => {
      const ruleKey = 'LIFECYCLE_TAG';
      pushItem(ruleKey, resolveGuidanceLabel(ruleKey, issue.message), issue.message, issue.severity);
    });

    return items;
  }, [governance, iterativeModeling]);

  const visibleGuidanceItems = React.useMemo(
    () => guidanceItems.filter((item) => !ignoredGuidance.includes(item.detail)),
    [guidanceItems, ignoredGuidance],
  );

  const guidanceGroups = React.useMemo(() => {
    const grouped = new Map<string, { ruleKey: string; ruleLabel: string; count: number; items: GuidanceItem[] }>();
    for (const item of visibleGuidanceItems) {
      const entry = grouped.get(item.ruleKey);
      if (!entry) {
        grouped.set(item.ruleKey, {
          ruleKey: item.ruleKey,
          ruleLabel: item.ruleLabel,
          count: item.count,
          items: [item],
        });
        continue;
      }
      entry.count += item.count;
      entry.items.push(item);
    }
    return Array.from(grouped.values()).sort((a, b) => a.ruleLabel.localeCompare(b.ruleLabel));
  }, [visibleGuidanceItems]);

  const visibleGuidanceCount = React.useMemo(
    () => visibleGuidanceItems.reduce((sum, item) => sum + item.count, 0),
    [visibleGuidanceItems],
  );

  const validationCount = React.useMemo(() => {
    if (!validationSummary) return 0;
    return validationSummary.errorCount + validationSummary.warningCount + validationSummary.infoCount;
  }, [validationSummary]);

  const stagedChangeCount = React.useMemo(
    () => stagedElements.length + stagedRelationships.length,
    [stagedElements.length, stagedRelationships.length],
  );

  const commitImpactPreview = React.useMemo(() => {
    const stagedTypeSet = new Set(stagedElements.map((el) => el.type));
    const stagedIdSet = new Set(stagedElements.map((el) => el.id));
    const views = ViewStore.list();

    const impactedViews = views.filter((view) => {
      const viewpoint = ViewpointRegistry.get(view.viewpointId);
      if (!viewpoint) return false;
      if (view.scope?.kind === 'ManualSelection') {
        return (view.scope.elementIds ?? []).some((id) => stagedIdSet.has(id));
      }
      return viewpoint.allowedElementTypes.some((t) => stagedTypeSet.has(t));
    });

    const relationshipTypes = Array.from(
      stagedRelationships.reduce((acc, rel) => {
        acc.add(rel.type);
        return acc;
      }, new Set<RelationshipType>()),
    );

    return {
      impactedViews,
      relationshipTypes,
    };
  }, [stagedElements, stagedRelationships]);

  return (
    <div className={styles.studioShell} style={{ borderColor: token.colorWarningBorder }}>
      <div className={styles.studioHeader} style={{ background: token.colorWarningBg, borderColor: token.colorWarningBorder }}>
        <div>
          <Typography.Text strong>Architecture Studio</Typography.Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button
            size="small"
            danger
            onClick={() => setDiscardOpen(true)}
          >
            Discard Workspace
          </Button>
          <Button
            size="small"
            onClick={() => {
              workspaceForm.setFieldsValue({
                name: designWorkspace.name,
                description: designWorkspace.description || '',
                scope: designWorkspace.scope || '',
                status: designWorkspace.status,
              });
              setWorkspaceModalOpen(true);
            }}
          >
            Edit Workspace
          </Button>
          {designWorkspace.status === 'DISCARDED' ? (
            <Tag color={workspaceStatusColor.DISCARDED}>Discarded</Tag>
          ) : null}
          <Button size="small" danger onClick={handleExit}>
            Exit Studio
          </Button>
        </div>
      </div>

      <div className={styles.studioSubHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Typography.Text strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {designWorkspace.name || 'Untitled Workspace'}
          </Typography.Text>
          {activeViewName ? (
            <Tag color="green" style={{ marginInlineStart: 0 }}>
              View: {activeViewName}
            </Tag>
          ) : null}
          <Tag color={modeBadge.color} style={{ marginInlineStart: 0 }}>
            {modeBadge.label}
          </Tag>
          {currentRepositoryUpdatedAt &&
          designWorkspace.repositoryUpdatedAt &&
          currentRepositoryUpdatedAt !== designWorkspace.repositoryUpdatedAt ? (
            <Tag color="gold" style={{ marginInlineStart: 0 }}>
              Repository updated
            </Tag>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastAutoSaveAt ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Saved {new Date(lastAutoSaveAt).toLocaleTimeString()}
            </Typography.Text>
          ) : null}
          <Button size="small" onClick={() => setCreateViewModalOpen(true)}>
            + Add View
          </Button>
          <Button
            size="small"
            type="primary"
            onClick={saveWorkspaceDraft}
            disabled={designWorkspace.status === 'COMMITTED'}
          >
            Save Workspace
          </Button>
          <Button
            size="small"
            type="primary"
            onClick={() => setCommitOpen(true)}
            disabled={commitDisabled}
          >
            Commit Workspace
          </Button>
        </div>
      </div>

      <div className={styles.studioColumns}>
        <div className={styles.studioLeft}>
          <div className={styles.studioWorkspaceCard}>
            <div className={styles.studioWorkspaceMeta}>
              <div className={styles.studioWorkspaceInfo}>
                <Typography.Text strong>{designWorkspace.name || 'Untitled Workspace'}</Typography.Text>
                {designWorkspace.description ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {designWorkspace.description}
                  </Typography.Text>
                ) : (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    No description provided.
                  </Typography.Text>
                )}
                {designWorkspace.scope ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Scope: {designWorkspace.scope}
                  </Typography.Text>
                ) : (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Scope: not set
                  </Typography.Text>
                )}
              </div>
              <Tag color={workspaceStatusColor[designWorkspace.status]}>{designWorkspace.status}</Tag>
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              Created by: {designWorkspace.createdBy || 'Unknown'} • Created: {new Date(designWorkspace.createdAt).toLocaleString()}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              Last saved: {new Date(designWorkspace.updatedAt).toLocaleString()}
            </Typography.Text>
          </div>

          <Typography.Text strong>Modeling Palette</Typography.Text>

          <div className={styles.studioLayerToggleGroup}>
            <Typography.Text strong>Tool Mode</Typography.Text>
            <Space size="small" wrap style={{ marginTop: 6 }}>
              <Button
                size="small"
                type={toolMode === 'SELECT' ? 'primary' : 'default'}
                onClick={() => {
                  resetToolDrafts();
                  setToolMode('SELECT');
                }}
              >
                Select
              </Button>
              <Button
                size="small"
                type={toolMode === 'CREATE_ELEMENT' ? 'primary' : 'default'}
                onClick={() => {
                  resetToolDrafts();
                  setToolMode('CREATE_ELEMENT');
                }}
              >
                Create Element
              </Button>
              <Button
                size="small"
                type={toolMode === 'CREATE_RELATIONSHIP' ? 'primary' : 'default'}
                onClick={() => {
                  if (!pendingRelationshipType) {
                    message.info('Select a relationship type from the palette first.');
                    return;
                  }
                  resetToolDrafts();
                  setToolMode('CREATE_RELATIONSHIP');
                }}
              >
                Create Relationship
              </Button>
              <Button
                size="small"
                type={toolMode === 'PAN' ? 'primary' : 'default'}
                onClick={() => {
                  resetToolDrafts();
                  setToolMode('PAN');
                }}
              >
                Pan
              </Button>
            </Space>
            <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
              ESC returns to Select mode. Choose a tool explicitly.
            </Typography.Text>
          </div>

          <div className={styles.studioLayerToggleGroup}>
            <Typography.Text strong>Layers</Typography.Text>
            <div className={styles.studioLayerToggleRow}>
              {(['Business', 'Application', 'Technology'] as const).map((layer) => (
                <Checkbox
                  key={layer}
                  checked={layerVisibility[layer]}
                  onChange={(e) => {
                    setLayerVisibility((prev) => ({ ...prev, [layer]: e.target.checked }));
                  }}
                >
                  {layer}
                </Checkbox>
              ))}
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              Toggle visibility only. No model changes.
            </Typography.Text>
            <div className={styles.studioLayerToggleRow}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Grid size
              </Typography.Text>
              <InputNumber
                size="small"
                min={8}
                max={80}
                step={2}
                value={gridSize}
                onChange={(value) => {
                  const next = Number(value);
                  if (!Number.isFinite(next)) return;
                  setGridSize(Math.max(4, Math.round(next)));
                }}
              />
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                Alt to disable snap
              </Typography.Text>
            </div>
          </div>

          <Collapse
            bordered
            size="small"
            activeKey={activePaletteSections}
            onChange={(keys) => {
              const next = Array.isArray(keys) ? keys : [keys];
              setActivePaletteSections(next.map(String));
            }}
            destroyInactivePanel
            items={[
              {
                key: 'elements',
                label: (
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseEnter={() => openPaletteSection('elements')}
                  >
                    <AppstoreOutlined />
                    <Typography.Text>Elements</Typography.Text>
                  </div>
                ),
                children: activePaletteSections.includes('elements') ? (
                  <div className={styles.studioPaletteList}>
                    {paletteBusinessElements.map((t) => (
                      <button
                        key={t.type}
                        type="button"
                        className={`${styles.studioPaletteItemButton} ${
                          toolMode === 'CREATE_ELEMENT' && pendingElementType === t.type
                            ? styles.studioPaletteItemButtonActive
                            : ''
                        }`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/x-ea-element-type', String(t.type));
                          e.dataTransfer.effectAllowed = 'copy';
                          setToolMode('CREATE_ELEMENT');
                        }}
                        onClick={() => {
                          setToolMode('CREATE_ELEMENT');
                          setPendingElementType(t.type as ObjectType);
                          setPendingRelationshipType(null);
                          setRelationshipSourceId(null);
                          setRelationshipTargetId(null);
                          setPlacementModeActive(true);
                          message.info(`Create ${t.type}: click the canvas to place.`);
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {renderTypeIcon(t.type)}
                          <Typography.Text>{t.type}</Typography.Text>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null,
              },
              {
                key: 'technology',
                label: (
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseEnter={() => openPaletteSection('technology')}
                  >
                    <CloudOutlined />
                    <Typography.Text>Technology</Typography.Text>
                  </div>
                ),
                children: activePaletteSections.includes('technology') ? (
                  <div className={styles.studioPaletteList}>
                    {paletteTechnologyElements.map((t) => {
                      const visual = technologyVisualByType.get(t.type);
                      const displayLabel =
                        t.type === 'Node'
                          ? 'Node (Physical / Virtual)'
                          : t.type === 'Compute'
                            ? 'Compute (VM, Container Host)'
                            : t.type === 'API'
                              ? 'API / Gateway'
                              : t.type === 'IntegrationPlatform'
                                ? 'Integration Platform'
                                : t.type;
                      return (
                        <button
                          key={t.type}
                          type="button"
                          className={`${styles.studioPaletteItemButton} ${
                            toolMode === 'CREATE_ELEMENT' && pendingElementType === t.type
                              ? styles.studioPaletteItemButtonActive
                              : ''
                          }`}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-ea-element-type', String(t.type));
                            e.dataTransfer.effectAllowed = 'copy';
                            setToolMode('CREATE_ELEMENT');
                          }}
                          onClick={() => {
                            setToolMode('CREATE_ELEMENT');
                            setPendingElementType(t.type as ObjectType);
                            setPendingRelationshipType(null);
                            setRelationshipSourceId(null);
                            setRelationshipTargetId(null);
                            setPlacementModeActive(true);
                            message.info(`Create ${displayLabel}: click the canvas to place.`);
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {visual ? (
                              <img src={visual.icon} alt="" className={styles.studioLegendIcon} />
                            ) : (
                              renderTypeIcon(t.type)
                            )}
                            <Typography.Text>{displayLabel}</Typography.Text>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null,
              },
              {
                key: 'relationships',
                label: (
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseEnter={() => openPaletteSection('relationships')}
                  >
                    <LinkOutlined />
                    <Typography.Text>Relationships</Typography.Text>
                  </div>
                ),
                children: activePaletteSections.includes('relationships') ? (
                  <div className={styles.studioPaletteList}>
                    {paletteRelationships.map((t) => (
                      <button
                        key={t.type}
                        type="button"
                        className={styles.studioPaletteItemButton}
                        onClick={() => {
                          setToolMode('CREATE_RELATIONSHIP');
                          setPendingRelationshipType(t.type as RelationshipType);
                          setPendingElementType(null);
                          setRelationshipSourceId(null);
                          setRelationshipTargetId(null);
                          setPlacementModeActive(false);
                          message.info(`Create ${t.type.replace(/_/g, ' ')}: select source then target.`);
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <LinkOutlined />
                          <Typography.Text>{t.type.replace(/_/g, ' ')}</Typography.Text>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null,
              },
            ]}
          />

          <div style={{ marginTop: 12 }}>
            <Typography.Text strong>Legend (Technology)</Typography.Text>
            <div className={styles.studioLegendList}>
              {TECHNOLOGY_VISUALS.map((entry) => (
                <div key={entry.type} className={styles.studioLegendItem}>
                  <span
                    className={styles.studioLegendSwatch}
                    style={{ backgroundColor: entry.color, borderColor: entry.border }}
                  />
                  <img src={entry.icon} alt="" className={styles.studioLegendIcon} />
                  <Typography.Text>{entry.label}</Typography.Text>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.studioCenter}>
          {pendingRelationshipType ? (
            <Alert
              type={relationshipDraft.valid === false ? 'error' : relationshipDraft.valid ? 'success' : 'info'}
              showIcon
              message={`Relationship drawing: ${pendingRelationshipType.replace(/_/g, ' ')}`}
              description={
                relationshipDraft.message ??
                'Click a source and drag to a target. Validation appears here before confirm.'
              }
              action={
                <Space direction="vertical" size={8}>
                  <Space>
                    <Button
                      size="small"
                      onClick={() => {
                        setRepoEndpointMode('source');
                        repoEndpointForm.resetFields();
                        setRepoEndpointOpen(true);
                      }}
                    >
                      Pick repo source
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        setRepoEndpointMode('target');
                        repoEndpointForm.resetFields();
                        setRepoEndpointOpen(true);
                      }}
                    >
                      Pick repo target
                    </Button>
                  </Space>
                  {canConfirmRelationship ? (
                    <Space>
                      <Button size="small" type="primary" onClick={confirmRelationshipDraft}>
                        Confirm
                      </Button>
                      <Button
                        size="small"
                        onClick={() => {
                          setRelationshipTargetId(null);
                          if (relationshipSourceId) {
                            setRelationshipDraft({
                              sourceId: relationshipSourceId,
                              targetId: null,
                              valid: null,
                              message: 'Target cleared. Choose another target to validate.',
                              dragging: false,
                            });
                          } else {
                            setRelationshipDraft({
                              sourceId: null,
                              targetId: null,
                              valid: null,
                              message: null,
                              dragging: false,
                            });
                          }
                          clearRelationshipDraftArtifacts();
                        }}
                      >
                        Cancel
                      </Button>
                    </Space>
                  ) : null}
                </Space>
              }
              style={{ marginBottom: 8 }}
            />
          ) : null}
          <div
            className={styles.studioCanvas}
            style={{
              cursor:
                toolMode === 'CREATE_ELEMENT'
                  ? 'crosshair'
                  : toolMode === 'CREATE_RELATIONSHIP'
                    ? 'alias'
                    : toolMode === 'PAN'
                      ? 'grab'
                      : 'default',
              backgroundSize: `${gridSize}px ${gridSize}px`,
            }}
            onMouseDown={(e) => {
              if (toolMode !== 'CREATE_ELEMENT' || !pendingElementType || !placementModeActive) return;
              const pos = toCanvasPosition(e.clientX, e.clientY);
              setElementDragAnchor(pos);
              setElementDragActive(true);
              elementDragMovedRef.current = false;
              setElementDragGhost(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (designWorkspace.status !== 'DRAFT') {
                message.warning('Workspace is read-only. Reopen draft to add elements.');
                return;
              }
              const type = e.dataTransfer.getData('application/x-ea-element-type');
              if (!type) return;
              const placement = toCanvasPosition(e.clientX, e.clientY);
              const elementType = type as ObjectType;
              setQuickCreatePlacement(placement);
              setQuickCreateType(elementType);
              quickCreateForm.setFieldsValue({ type: elementType, name: '', description: '' });
              setQuickCreateOpen(true);
            }}
            onMouseMove={(e) => {
              if (toolMode !== 'CREATE_ELEMENT' || !placementModeActive) return;
              const pos = toCanvasPosition(e.clientX, e.clientY);
              setPlacementGuide(pos);
              setCreateHintPos(pos);

              if (!elementDragActive || !elementDragAnchor) return;
              const dx = Math.abs(pos.x - elementDragAnchor.x);
              const dy = Math.abs(pos.y - elementDragAnchor.y);
              if (dx > 4 || dy > 4) {
                elementDragMovedRef.current = true;
                setElementDragGhost({ x: pos.x, y: pos.y, width: 120, height: 48 });
              }
            }}
            onMouseLeave={() => {
              if (toolMode !== 'CREATE_ELEMENT' || !placementModeActive) return;
              setPlacementGuide(null);
              setCreateHintPos(null);
              setElementDragGhost(null);
              setElementDragAnchor(null);
              setElementDragActive(false);
            }}
            onMouseUp={(e) => {
              if (toolMode !== 'CREATE_ELEMENT' || !pendingElementType || !placementModeActive) return;
              if (!elementDragActive) return;
              const pos = toCanvasPosition(e.clientX, e.clientY);
              const didDrag = elementDragMovedRef.current;
              setElementDragActive(false);
              setElementDragAnchor(null);
              setElementDragGhost(null);

              if (!didDrag) return;

              if (!validateStudioElementType(pendingElementType)) return;
              const draftId = `draft-${generateUUID()}`;
              const name = `New ${pendingElementType}`;
              const id = stageElement({
                id: draftId,
                type: pendingElementType,
                name,
                description: '',
                placement: { x: pos.x, y: pos.y },
              });
              suppressNextTapRef.current = true;
              openPropertiesPanel({ elementId: id, elementType: pendingElementType, dock: 'right', readOnly: false });
              setToolMode('SELECT');
              resetToolDrafts();
            }}
          >
            {createElementHelperText ? (
              <div className={styles.studioToolHelper}>
                <Typography.Text type="secondary">{createElementHelperText}</Typography.Text>
              </div>
            ) : null}
            {createElementFloatingHint && createHintPos ? (
              <div
                className={styles.studioCreateHint}
                style={{ left: createHintPos.x + 10, top: createHintPos.y + 10 }}
              >
                {createElementFloatingHint}
              </div>
            ) : null}
            <div ref={containerRef} className={styles.studioCanvasSurface} />
            {placementModeActive && placementGuide ? (
              <div
                className={styles.studioPlacementGuide}
                style={{ left: placementGuide.x, top: placementGuide.y }}
              />
            ) : null}
            {elementDragGhost ? (
              <div
                className={styles.studioPlacementGhost}
                style={{
                  left: elementDragGhost.x - elementDragGhost.width / 2,
                  top: elementDragGhost.y - elementDragGhost.height / 2,
                  width: elementDragGhost.width,
                  height: elementDragGhost.height,
                }}
              />
            ) : null}
            {alignmentGuides.x !== null && (
              <div className={styles.studioAlignmentGuideVertical} style={{ left: alignmentGuides.x }} />
            )}
            {alignmentGuides.y !== null && (
              <div className={styles.studioAlignmentGuideHorizontal} style={{ top: alignmentGuides.y }} />
            )}
            {validationSummary && (validationSummary.errorCount > 0 || validationSummary.warningCount > 0) && (
              <div className={styles.studioCanvasOverlay}>
                {!iterativeModeling && validationSummary.errorCount > 0 && (
                  <Alert
                    type="error"
                    showIcon
                    message={`Blocking errors: ${validationSummary.errorCount}`}
                    description={
                      validationSummary.errorHighlights.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {validationSummary.errorHighlights.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      ) : null
                    }
                  />
                )}
                {!iterativeModeling && validationSummary.warningCount > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    message={`Advisory warnings: ${validationSummary.warningCount}`}
                    description={
                      validationSummary.warningHighlights.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {validationSummary.warningHighlights.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      ) : null
                    }
                  />
                )}
              </div>
            )}
            <div className={styles.studioCanvasHint}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Tag color="gold" style={{ marginInlineStart: 0 }}>
                  Staged
                </Tag>
                <span
                  style={{
                    width: 18,
                    height: 0,
                    borderTop: '2px dashed #fa8c16',
                    display: 'inline-block',
                  }}
                />
                <Tooltip
                  placement="topRight"
                  title={
                    <div style={{ display: 'grid', gap: 6 }}>
                      <Typography.Text>Placement-only canvas. Move/select for alignment & grouping.</Typography.Text>
                      <Typography.Text>Snap-to-grid enabled (20px). Alignment guides appear on drag.</Typography.Text>
                      <Typography.Text>Staged items use dashed amber borders until committed.</Typography.Text>
                      <Typography.Text>Staged label marks draft elements and relationships.</Typography.Text>
                    </div>
                  }
                >
                  <Button
                    type="text"
                    size="small"
                    aria-label="Canvas guidance"
                    icon={<InfoCircleOutlined />}
                    style={{ paddingInline: 0, height: 20, color: 'rgba(0,0,0,0.45)' }}
                  />
                </Tooltip>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.studioRight}>
          <div className={styles.studioRightSection}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Typography.Text strong>Properties</Typography.Text>
              {propertiesExpanded ? (
                <Button size="small" type="text" onClick={() => setPropertiesExpanded(false)}>
                  Collapse
                </Button>
              ) : null}
            </div>
            <div className={styles.studioRightBody}>
              {!propertiesExpanded ? (
                <div className={styles.studioCompactProperties}>
                  <div className={styles.studioCompactPropertiesRow}>
                    <div className={styles.studioCompactTypeIcon}>{renderTypeIcon(compactSelectedElement?.type)}</div>
                    <div style={{ display: 'grid', gap: 2 }}>
                      <Typography.Text strong>
                        {compactSelectedElement?.name || 'No selection'}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {compactSelectedElement?.type || 'Select an element'}
                      </Typography.Text>
                    </div>
                    <Tag color={compactWarningCount > 0 ? 'gold' : 'default'} style={{ marginLeft: 'auto' }}>
                      Warnings: {compactWarningCount}
                    </Tag>
                  </div>
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => setPropertiesExpanded(true)}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    Edit Properties
                  </Button>
                </div>
              ) : (
                <>
              {validationSummary && (iterativeModeling ? validationSummary.infoCount > 0 : (validationSummary.errorCount > 0 || validationSummary.warningCount > 0)) && (
                <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
                  {!iterativeModeling && validationSummary.errorCount > 0 && (
                    <Alert type="error" showIcon message={`Blocking errors: ${validationSummary.errorCount}`} />
                  )}
                  {!iterativeModeling && validationSummary.warningCount > 0 && (
                    <Alert type="warning" showIcon message={`Advisory warnings: ${validationSummary.warningCount}`} />
                  )}
                  {validationSummary.infoCount > 0 && (
                    <Alert type="info" showIcon message={`Guidance: ${validationSummary.infoCount}`} />
                  )}
                </div>
              )}
              {selectedStagedElements.length > 1 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <Alert
                    type="info"
                    showIcon
                    message={`Bulk edit (${selectedStagedElements.length} staged elements)`}
                    description="Edit shared fields only. Changes apply to all selected staged elements."
                  />
                  <Form
                    form={bulkEditForm}
                    layout="vertical"
                    onFinish={(values) => {
                      const description = (values.description ?? '').trim();
                      if (!description) {
                        message.info('Enter a description to apply.');
                        return;
                      }
                      const selectedSet = new Set(selectedStagedElements.map((el) => el.id));
                      setStagedElements((prev) =>
                        prev.map((el) => (selectedSet.has(el.id) ? { ...el, description } : el)),
                      );
                      message.success('Bulk description applied.');
                    }}
                  >
                    <Form.Item label="Description (set for all)" name="description">
                      <Input.TextArea rows={3} placeholder="Enter shared description" />
                    </Form.Item>
                    <Button type="primary" onClick={() => bulkEditForm.submit()}>
                      Apply to selected
                    </Button>
                  </Form>
                </div>
              ) : stagedSelectedElement ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <Alert
                    type="info"
                    showIcon
                    message={`Staged element • ${stagedSelectedElement.type}`}
                    description="Edits apply to the workspace only."
                  />
                  {stagedSelectedElementExistsInRepo ? (
                    isMarkedForRemoval(stagedSelectedElement.attributes) ? (
                      <Alert
                        type="warning"
                        showIcon
                        message="Marked for removal"
                        description="This element will be removed from the repository on commit."
                        action={
                          <Button
                            size="small"
                            onClick={() => {
                              setStagedElements((prev) =>
                                prev.map((el) =>
                                  el.id === stagedSelectedElement.id
                                    ? {
                                        ...el,
                                        status: 'STAGED',
                                        attributes: { ...(el.attributes ?? {}), _deleted: false },
                                      }
                                    : el,
                                ),
                              );
                            }}
                          >
                            Undo removal
                          </Button>
                        }
                      />
                    ) : (
                      <Button
                        danger
                        onClick={() => {
                          setStagedElements((prev) =>
                            prev.map((el) =>
                              el.id === stagedSelectedElement.id
                                ? {
                                    ...el,
                                    status: 'DISCARDED',
                                    attributes: { ...(el.attributes ?? {}), _deleted: true },
                                  }
                                : el,
                            ),
                          );
                        }}
                      >
                        Mark for removal
                      </Button>
                    )
                  ) : null}
                  <Button
                    danger
                    onClick={() => {
                      Modal.confirm({
                        title: 'Delete staged element?',
                        content: 'This removes the element from the workspace only. Repository remains unchanged.',
                        okText: 'Delete',
                        okButtonProps: { danger: true },
                        cancelText: 'Cancel',
                        onOk: () => deleteStagedElement(stagedSelectedElement.id),
                      });
                    }}
                  >
                    Delete staged element
                  </Button>
                  {!isMarkedForRemoval(stagedSelectedElement.attributes) ? (
                    <Form
                      layout="vertical"
                      initialValues={{
                        name: stagedSelectedElement.name,
                        description: stagedSelectedElement.description,
                        ...(stagedSelectedElement.attributes ?? {}),
                      }}
                      onValuesChange={(changed) => {
                        setStagedElements((prev) =>
                          prev.map((el) => {
                            if (el.id !== stagedSelectedElement.id) return el;
                            const next = {
                              ...el,
                              name: typeof changed.name === 'string' ? changed.name : el.name,
                              description:
                                typeof changed.description === 'string' ? changed.description : el.description,
                              attributes: {
                                ...(el.attributes ?? {}),
                                ...changed,
                              },
                            };
                            return next;
                          }),
                        );

                        if (cyRef.current) {
                          const node = cyRef.current.getElementById(stagedSelectedElement.id);
                          if (node && !node.empty() && typeof changed.name === 'string') {
                            node.data('label', changed.name);
                          }
                        }
                      }}
                      validateTrigger={['onChange', 'onBlur']}
                    >
                      <Form.Item
                        label="Name"
                        name="name"
                        rules={[{ required: true, message: 'Name is required' }]}
                      >
                        <Input autoFocus />
                      </Form.Item>
                      <Form.Item label="Description" name="description">
                        <Input.TextArea rows={3} />
                      </Form.Item>
                      {requiredElementAttributes(stagedSelectedElement.type).map((attr) => (
                        <Form.Item
                          key={attr}
                          label={attr}
                          name={attr}
                          rules={[{ required: true, message: `${attr} is required` }]}
                        >
                          <Input placeholder={`Enter ${attr}`} />
                        </Form.Item>
                      ))}
                    </Form>
                  ) : null}
                </div>
              ) : stagedSelectedRelationship ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <Alert
                    type="info"
                    showIcon
                    message={`Staged relationship • ${stagedSelectedRelationship.type.replace(/_/g, ' ')}`}
                    description="Relationships are staged only."
                  />
                  {stagedSelectedRelationshipExistsInRepo ? (
                    isMarkedForRemoval(stagedSelectedRelationship.attributes) ? (
                      <Alert
                        type="warning"
                        showIcon
                        message="Marked for removal"
                        description="This relationship will be removed from the repository on commit."
                        action={
                          <Button
                            size="small"
                            onClick={() => {
                              setStagedRelationships((prev) =>
                                prev.map((rel) =>
                                  rel.id === stagedSelectedRelationship.id
                                    ? {
                                        ...rel,
                                        status: 'STAGED',
                                        attributes: { ...(rel.attributes ?? {}), _deleted: false },
                                      }
                                    : rel,
                                ),
                              );
                            }}
                          >
                            Undo removal
                          </Button>
                        }
                      />
                    ) : (
                      <Button
                        danger
                        onClick={() => {
                          setStagedRelationships((prev) =>
                            prev.map((rel) =>
                              rel.id === stagedSelectedRelationship.id
                                ? {
                                    ...rel,
                                    status: 'DISCARDED',
                                    attributes: { ...(rel.attributes ?? {}), _deleted: true },
                                  }
                                : rel,
                            ),
                          );
                        }}
                      >
                        Mark for removal
                      </Button>
                    )
                  ) : null}
                  <Button
                    danger
                    onClick={() => {
                      Modal.confirm({
                        title: 'Delete staged relationship?',
                        content: 'This removes the relationship from the workspace only. Repository remains unchanged.',
                        okText: 'Delete',
                        okButtonProps: { danger: true },
                        cancelText: 'Cancel',
                        onOk: () => deleteStagedRelationship(stagedSelectedRelationship.id),
                      });
                    }}
                  >
                    Delete staged relationship
                  </Button>
                  <Descriptions size="small" column={1} bordered>
                    <Descriptions.Item label="From">
                      {resolveElementLabel(stagedSelectedRelationship.fromId)?.label ?? stagedSelectedRelationship.fromId}
                    </Descriptions.Item>
                    <Descriptions.Item label="To">
                      {resolveElementLabel(stagedSelectedRelationship.toId)?.label ?? stagedSelectedRelationship.toId}
                    </Descriptions.Item>
                    <Descriptions.Item label="Status">
                      {stagedSelectedRelationship.status}
                    </Descriptions.Item>
                  </Descriptions>
                  {!isMarkedForRemoval(stagedSelectedRelationship.attributes) ? (
                    (RELATIONSHIP_TYPE_DEFINITIONS[stagedSelectedRelationship.type]?.attributes ?? []).length > 0 ? (
                      <Form
                        form={relationshipAttributesForm}
                        layout="vertical"
                        onValuesChange={(changed) => {
                          setStagedRelationships((prev) =>
                            prev.map((rel) => {
                              if (rel.id !== stagedSelectedRelationship.id) return rel;
                              return {
                                ...rel,
                                attributes: {
                                  ...(rel.attributes ?? {}),
                                  ...changed,
                                },
                              };
                            }),
                          );
                        }}
                        validateTrigger={['onChange', 'onBlur']}
                      >
                        {(RELATIONSHIP_TYPE_DEFINITIONS[stagedSelectedRelationship.type]?.attributes ?? []).map(
                          (attr) => (
                            <Form.Item
                              key={attr}
                              label={attr}
                              name={attr}
                              rules={[{ required: true, message: `${attr} is required` }]}
                            >
                              <Input placeholder={`Enter ${attr}`} />
                            </Form.Item>
                          ),
                        )}
                      </Form>
                    ) : (
                      <Typography.Text type="secondary">No mandatory relationship attributes.</Typography.Text>
                    )
                  ) : null}
                </div>
              ) : selectedExistingElement ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <Alert
                    type="info"
                    showIcon
                    message={`Existing element • ${selectedExistingElement.type}`}
                    description="Stage this element to edit within the workspace. Repository stays unchanged."
                  />
                  <Descriptions size="small" column={1} bordered>
                    <Descriptions.Item label="Name">
                      {((selectedExistingElement.attributes as any)?.name as string) || selectedExistingElement.id}
                    </Descriptions.Item>
                    <Descriptions.Item label="ID">{selectedExistingElement.id}</Descriptions.Item>
                  </Descriptions>
                  <Button type="primary" onClick={() => stageExistingElement(selectedExistingElement.id)}>
                    Stage for editing
                  </Button>
                </div>
              ) : selectedExistingRelationship ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <Alert
                    type="info"
                    showIcon
                    message={`Existing relationship • ${selectedExistingRelationship.type.replace(/_/g, ' ')}`}
                    description="Stage this relationship to edit within the workspace. Repository stays unchanged."
                  />
                  <Descriptions size="small" column={1} bordered>
                    <Descriptions.Item label="From">
                      {resolveElementLabel(selectedExistingRelationship.fromId)?.label ?? selectedExistingRelationship.fromId}
                    </Descriptions.Item>
                    <Descriptions.Item label="To">
                      {resolveElementLabel(selectedExistingRelationship.toId)?.label ?? selectedExistingRelationship.toId}
                    </Descriptions.Item>
                  </Descriptions>
                  <Button type="primary" onClick={() => stageExistingRelationship(selectedExistingRelationship.id)}>
                    Stage for editing
                  </Button>
                </div>
              ) : (
                propertiesPanel
              )}
                </>
              )}
            </div>
          </div>

          <div className={styles.studioRightSection}>
            <Typography.Text strong>Selection</Typography.Text>
            <div className={styles.studioRightBody}>
              {selectedNodeIds.length > 1 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <Alert
                    type="info"
                    showIcon
                    message={`Selected elements: ${selectedNodeIds.length}`}
                    description="Use bulk edit to update shared fields for staged elements."
                  />
                  <Space wrap>
                    <Button type="default" onClick={() => setBulkEditOpen(true)}>
                      Bulk edit selected
                    </Button>
                    <Button type="default" onClick={() => distributeSelectedNodes('x')}>
                      Distribute horizontally
                    </Button>
                    <Button type="default" onClick={() => distributeSelectedNodes('y')}>
                      Distribute vertically
                    </Button>
                    <Button type="default" onClick={cleanAlignToGrid}>
                      Clean align (snap)
                    </Button>
                    <Button type="default" onClick={resetLayout}>
                      Reset layout
                    </Button>
                  </Space>
                </div>
              ) : (
                <Empty description="Multi-select elements to bulk edit" />
              )}
            </div>
          </div>

          <div className={styles.studioRightSection}>
            <div className={styles.studioRightBody}>
              <Collapse
                ghost
                expandIconPosition="end"
                items={[
                  {
                    key: 'staged',
                    label: (
                      <Tooltip title="Staged changes">
                        <Tag color="blue" style={{ marginInlineStart: 0 }}>
                          ● {stagedChangeCount}
                        </Tag>
                      </Tooltip>
                    ),
                    children: (
                      <div style={{ display: 'grid', gap: 8 }}>
                        <Alert
                          type="info"
                          showIcon
                          message={`Elements staged: ${stagedElements.length}`}
                          description={
                            stagedElements.length
                              ? stagedElements.slice(0, 4).map((el) => `${el.name} (${el.type})`).join(' • ')
                              : 'No staged elements yet.'
                          }
                        />
                        <Alert
                          type="info"
                          showIcon
                          message={`Relationships staged: ${stagedRelationships.length}`}
                          description={
                            stagedRelationships.length
                              ? stagedRelationships
                                  .slice(0, 4)
                                  .map((rel) => `${rel.type.replace(/_/g, ' ')} (${rel.fromId} → ${rel.toId})`)
                                  .join(' • ')
                              : 'No staged relationships yet.'
                          }
                        />
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </div>

          <div className={styles.studioRightSection}>
            <div className={styles.studioRightBody}>
              <Collapse
                ghost
                expandIconPosition="end"
                items={[
                  {
                    key: 'validation',
                    label: (
                      <Tooltip title="Validation">
                        <Tag color="red" style={{ marginInlineStart: 0 }}>
                          ❌ {validationCount}
                        </Tag>
                      </Tooltip>
                    ),
                    children: validationSummary && (validationSummary.errorCount > 0 || validationSummary.warningCount > 0 || validationSummary.infoCount > 0) ? (
                      <div className={styles.studioValidationList}>
                        {validationSummary.errorHighlights.map((m) => (
                          <Alert key={`err:${m}`} type="error" showIcon message={m} />
                        ))}
                        {validationSummary.warningHighlights.map((m) => (
                          <Alert key={`warn:${m}`} type="warning" showIcon message={m} />
                        ))}
                        {validationSummary.infoHighlights.map((m) => (
                          <Alert key={`info:${m}`} type="info" showIcon message={m} />
                        ))}
                      </div>
                    ) : (
                      <Empty description="No validation messages yet" />
                    ),
                  },
                ]}
              />
            </div>
          </div>

          <div className={styles.studioRightSection}>
            <div className={styles.studioRightBody}>
              <Collapse
                ghost
                expandIconPosition="end"
                items={[
                  {
                    key: 'guidance',
                    label: (
                      <Tooltip title="Guidance">
                        <Tag color="gold" style={{ marginInlineStart: 0 }}>
                          ⚠️ {visibleGuidanceCount}
                        </Tag>
                      </Tooltip>
                    ),
                    children: (
                      <>
                        {guidanceGroups.length > 0 ? (
                          <Collapse
                            ghost
                            expandIconPosition="end"
                            items={guidanceGroups.map((group) => ({
                              key: group.ruleKey,
                              label: (
                                <Typography.Text>
                                  {group.ruleLabel} ({group.count})
                                </Typography.Text>
                              ),
                              children: (
                                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                  {group.items.slice(0, 6).map((item) => (
                                    <div key={item.detail} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                      <Alert type="info" showIcon message={item.detail} style={{ flex: 1 }} />
                                      <Button
                                        size="small"
                                        onClick={() =>
                                          setIgnoredGuidance((prev) =>
                                            prev.includes(item.detail) ? prev : [...prev, item.detail],
                                          )
                                        }
                                      >
                                        Resolve later
                                      </Button>
                                    </div>
                                  ))}
                                  {group.items.length > 6 ? (
                                    <Typography.Text type="secondary">+{group.items.length - 6} more</Typography.Text>
                                  ) : null}
                                </Space>
                              ),
                            }))}
                          />
                        ) : (
                          <Empty description="No guidance" />
                        )}

                        {ignoredGuidance.length > 0 ? (
                          <div style={{ marginTop: 12 }}>
                            <Typography.Text type="secondary">Resolve later ({ignoredGuidance.length})</Typography.Text>
                            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                              {ignoredGuidance.slice(0, 5).map((msg) => (
                                <div key={`ignored:${msg}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <Tag color="default">Resolve later</Tag>
                                  <Typography.Text type="secondary" style={{ flex: 1 }}>
                                    {msg}
                                  </Typography.Text>
                                  <Button
                                    size="small"
                                    type="link"
                                    onClick={() =>
                                      setIgnoredGuidance((prev) => prev.filter((m) => m !== msg))
                                    }
                                  >
                                    Restore
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={repoEndpointOpen}
        title={repoEndpointMode === 'source' ? 'Select repository source' : 'Select repository target'}
        okText="Use selection"
        cancelText="Cancel"
        onCancel={() => setRepoEndpointOpen(false)}
        onOk={async () => {
          try {
            const values = await repoEndpointForm.validateFields();
            const selectedId = String(values.repositoryElementId || '').trim();
            if (!selectedId) return;
            if (!pendingRelationshipType) {
              message.warning('Select a relationship type first.');
              return;
            }

            if (repoEndpointMode === 'source') {
              setRelationshipSourceId(selectedId);
              setRelationshipTargetId(null);
              setRelationshipDraft({
                sourceId: selectedId,
                targetId: null,
                valid: null,
                message: 'Repository source selected. Choose a target on the canvas.',
                dragging: false,
              });
              setRepoEndpointOpen(false);
              return;
            }

            if (!relationshipSourceId) {
              message.warning('Pick a source on the canvas first.');
              return;
            }

            const validation = validateRelationshipEndpoints(relationshipSourceId, selectedId, pendingRelationshipType);
            if (!validation.valid) {
              message.error(validation.message || 'Invalid relationship endpoints.');
              return;
            }

            setRelationshipTargetId(selectedId);
            setRelationshipDraft({
              sourceId: relationshipSourceId,
              targetId: selectedId,
              valid: true,
              message: 'Target selected. Confirm or cancel to continue.',
              dragging: false,
            });
            setRepoEndpointOpen(false);
          } catch {
            // validation handled by Form
          }
        }}
      >
        <Form form={repoEndpointForm} layout="vertical">
          <Form.Item
            label="Repository element"
            name="repositoryElementId"
            rules={[{ required: true, message: 'Select a repository element' }]}
          >
            <Select
              showSearch
              placeholder="Select repository element"
              options={repositoryElementOptions}
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={createViewModalOpen}
        title="Create View"
        onCancel={() => setCreateViewModalOpen(false)}
        footer={null}
        destroyOnClose
        width={820}
      >
        <CreateViewWizard
          embedded
          navigateOnCreate={false}
          showCreatedPreview={false}
          successMessage="View created"
          onCreated={handleViewCreated}
        />
      </Modal>

      <Modal
        open={commitOpen}
        title="Commit Workspace"
        okText="Commit (irreversible)"
        cancelText="Cancel"
        okButtonProps={{ danger: true }}
        cancelButtonProps={{ autoFocus: true }}
        keyboard={false}
        maskClosable={false}
        onCancel={() => setCommitOpen(false)}
        onOk={() => commitWorkspace()}
      >
        <Alert
          type="warning"
          showIcon
          message="You are about to commit architecture changes to the repository."
          description="Confirm to proceed or cancel to review changes."
          style={{ marginBottom: 12 }}
        />
        <Alert
          type="warning"
          showIcon
          message="Commit is irreversible"
          description="Workspace will be locked as COMMITTED and cannot be reopened for edits."
          style={{ marginBottom: 12 }}
        />
        {stagedValidationErrors.length > 0 || (governanceMode !== 'Advisory' && (validationSummary?.warningCount ?? 0) > 0) ? (
          <Alert
            type="error"
            showIcon
            message="Validation errors block commit"
            description={
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {stagedValidationErrors.slice(0, 6).map((err) => (
                  <li key={err}>{err}</li>
                ))}
                {governanceMode !== 'Advisory'
                  ? (validationSummary?.warningHighlights ?? []).map((warn) => (
                      <li key={warn}>{warn}</li>
                    ))
                  : null}
              </ul>
            }
            style={{ marginBottom: 12 }}
          />
        ) : (
          <Alert
            type="success"
            showIcon
            message="Validation passed"
            description="No blocking validation errors detected."
            style={{ marginBottom: 12 }}
          />
        )}
        <Typography.Text strong>Summary</Typography.Text>
        <ul style={{ marginTop: 6, paddingLeft: 18 }}>
          <li>Elements staged: {stagedElements.length}</li>
          <li>Relationships staged: {stagedRelationships.length}</li>
        </ul>
        <Typography.Text strong>Counts by element type</Typography.Text>
        <ul style={{ marginTop: 6, paddingLeft: 18 }}>
          {stagedElements.length ? (
            Array.from(
              stagedElements.reduce((acc, el) => {
                acc.set(el.type, (acc.get(el.type) ?? 0) + 1);
                return acc;
              }, new Map<ObjectType, number>()),
            ).map(([type, count]) => (
              <li key={type}>
                {type}: {count}
              </li>
            ))
          ) : (
            <li>None</li>
          )}
        </ul>
        <Typography.Text strong>Elements to be created</Typography.Text>
        <ul style={{ marginTop: 6, paddingLeft: 18 }}>
          {stagedElements.length ? (
            stagedElements.slice(0, 6).map((el) => (
              <li key={el.id}>
                {el.name} ({el.type})
              </li>
            ))
          ) : (
            <li>None</li>
          )}
        </ul>
        {stagedElements.length > 6 ? (
          <Typography.Text type="secondary">+{stagedElements.length - 6} more</Typography.Text>
        ) : null}
        <Typography.Text strong style={{ display: 'block', marginTop: 12 }}>
          Relationships to be created
        </Typography.Text>
        <ul style={{ marginTop: 6, paddingLeft: 18 }}>
          {stagedRelationships.length ? (
            stagedRelationships.slice(0, 6).map((rel) => (
              <li key={rel.id}>
                {rel.type.replace(/_/g, ' ')}: {rel.fromId} → {rel.toId}
              </li>
            ))
          ) : (
            <li>None</li>
          )}
        </ul>
        {stagedRelationships.length > 6 ? (
          <Typography.Text type="secondary">+{stagedRelationships.length - 6} more</Typography.Text>
        ) : null}
        <Typography.Text strong style={{ display: 'block', marginTop: 12 }}>
          Impact preview
        </Typography.Text>
        <Typography.Text strong style={{ display: 'block', marginTop: 6 }}>
          Views that would include new elements
        </Typography.Text>
        <ul style={{ marginTop: 6, paddingLeft: 18 }}>
          {commitImpactPreview.impactedViews.length ? (
            commitImpactPreview.impactedViews.slice(0, 6).map((view) => (
              <li key={view.id}>
                {view.name || view.id} ({view.viewpointId})
              </li>
            ))
          ) : (
            <li>None detected</li>
          )}
        </ul>
        {commitImpactPreview.impactedViews.length > 6 ? (
          <Typography.Text type="secondary">
            +{commitImpactPreview.impactedViews.length - 6} more
          </Typography.Text>
        ) : null}
        <Typography.Text strong style={{ display: 'block', marginTop: 12 }}>
          Impact analysis (high-level)
        </Typography.Text>
        <Typography.Paragraph type="secondary" style={{ marginTop: 6 }}>
          +{stagedElements.length} elements, +{stagedRelationships.length} relationships staged.
          {commitImpactPreview.relationshipTypes.length
            ? ` Relationship types: ${commitImpactPreview.relationshipTypes.join(', ')}.`
            : ''}
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary" style={{ marginTop: 6 }}>
          Informational only. Repository remains unchanged until commit completes.
        </Typography.Paragraph>
      </Modal>

      <Modal
        open={discardOpen}
        title="Discard Workspace"
        okText="Confirm Discard"
        cancelText="Cancel"
        okButtonProps={{ danger: true, autoFocus: false }}
        cancelButtonProps={{ autoFocus: true }}
        keyboard={false}
        maskClosable={false}
        onCancel={() => setDiscardOpen(false)}
        onOk={discardWorkspaceNow}
      >
        <Alert
          type="warning"
          showIcon
          message="Discarding this workspace will permanently delete all uncommitted design changes."
          description="All staged changes will be removed and the repository will remain untouched. This cannot be undone."
          style={{ marginBottom: 12 }}
        />
        <Typography.Text strong>Workspace</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ marginTop: 6 }}>
          {designWorkspace.name || 'Untitled Workspace'}
        </Typography.Paragraph>
        <Typography.Text strong>Staged changes</Typography.Text>
        <ul style={{ marginTop: 6, paddingLeft: 18 }}>
          <li>Elements staged: {stagedElements.length}</li>
          <li>Relationships staged: {stagedRelationships.length}</li>
        </ul>
      </Modal>

      <Modal
        open={quickCreateOpen}
        title="Quick create element"
        okText="Stage element"
        cancelText="Cancel"
        onCancel={() => setQuickCreateOpen(false)}
        onOk={() => void handleQuickCreate(false)}
      >
        <Alert
          type="info"
          showIcon
          message="Quick create (staged)"
          description="Creates a staged element only. Repository and views stay unchanged."
          style={{ marginBottom: 12 }}
        />
        <Form
          form={quickCreateForm}
          layout="vertical"
          initialValues={{
            type: quickCreateType ?? undefined,
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setQuickCreateOpen(false);
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleQuickCreate(true);
            }
          }}
        >
          <Form.Item label="Element type" name="type" rules={[{ required: true, message: 'Select a type' }]}>
            <Select
              placeholder="Select element type"
              options={[...paletteBusinessElements, ...paletteTechnologyElements].map((t) => ({ value: t.type, label: t.type }))}
            />
          </Form.Item>
          <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="Enter name" allowClear />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea placeholder="Optional description" rows={3} allowClear />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={bulkEditOpen}
        title={`Bulk edit (${selectedNodeIds.length} elements)`}
        okText="Apply"
        cancelText="Cancel"
        onCancel={() => setBulkEditOpen(false)}
        onOk={async () => {
          try {
            const values = await bulkEditForm.validateFields();
            const prefix = (values.namePrefix ?? '').trim();
            const suffix = (values.nameSuffix ?? '').trim();
            const description = (values.description ?? '').trim();

            if (!prefix && !suffix && !description) {
              message.info('Nothing to apply.');
              return;
            }

            setStagedElements((prev) =>
              prev.map((el) => {
                if (!selectedNodeIds.includes(el.id)) return el;
                const nextName = `${prefix}${el.name}${suffix}`;
                return {
                  ...el,
                  name: prefix || suffix ? nextName : el.name,
                  description: description ? description : el.description,
                };
              }),
            );

            if (cyRef.current) {
              selectedNodeIds.forEach((id) => {
                const node = cyRef.current?.getElementById(id);
                if (!node) return;
                const current = node.data('label') as string;
                const nextLabel = `${prefix}${current}${suffix}`;
                node.data('label', prefix || suffix ? nextLabel : current);
              });
            }

            setBulkEditOpen(false);
            bulkEditForm.resetFields();
            message.success('Bulk changes applied to staged elements.');
          } catch {
            // validation handled by Form
          }
        }}
      >
        <Alert
          type="warning"
          showIcon
          message="Bulk edit applies to staged elements only"
          description="Repository and views remain unchanged until a commit workflow is implemented."
          style={{ marginBottom: 12 }}
        />
        <Form form={bulkEditForm} layout="vertical">
          <Form.Item label="Name prefix" name="namePrefix">
            <Input placeholder="Optional prefix" allowClear />
          </Form.Item>
          <Form.Item label="Name suffix" name="nameSuffix">
            <Input placeholder="Optional suffix" allowClear />
          </Form.Item>
          <Form.Item label="Description (set for all)" name="description">
            <Input.TextArea placeholder="Optional description" rows={3} allowClear />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={workspaceModalOpen}
        title="Design Workspace"
        okText="Save Workspace"
        cancelText="Cancel"
        onCancel={() => setWorkspaceModalOpen(false)}
        onOk={async () => {
          try {
            const values = await workspaceForm.validateFields();
            const layout = buildLayoutFromCanvas();
            const next: DesignWorkspace = {
              ...designWorkspace,
              name: values.name.trim(),
              description: values.description?.trim() || '',
              scope: values.scope || undefined,
              status: values.status,
              updatedAt: new Date().toISOString(),
              layout,
              stagedElements,
              stagedRelationships,
            };
            onUpdateWorkspace(next);
            setWorkspaceModalOpen(false);
          } catch {
            // validation handled by Form
          }
        }}
      >
        <Alert
          type="info"
          showIcon
          message="Design Workspace is separate from views and baselines"
          description="Use a workspace to experiment safely before committing changes to the repository."
          style={{ marginBottom: 12 }}
        />
        <Form form={workspaceForm} layout="vertical" initialValues={{
          name: designWorkspace.name,
          description: designWorkspace.description,
          scope: designWorkspace.scope,
          status: designWorkspace.status,
        }}>
          <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="Workspace name" allowClear />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea placeholder="Workspace description" rows={3} allowClear />
          </Form.Item>
          <Form.Item label="Scope (optional)" name="scope">
            <Select
              allowClear
              placeholder="Select scope"
              options={[
                { value: 'Enterprise', label: 'Enterprise' },
                { value: 'Capability', label: 'Capability' },
                { value: 'Application', label: 'Application' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Status" name="status" rules={[{ required: true, message: 'Status is required' }]}>
            <Select
              options={[
                { label: 'DRAFT', value: 'DRAFT' },
                { label: 'COMMITTED', value: 'COMMITTED' },
                { label: 'DISCARDED', value: 'DISCARDED' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={createModalOpen}
        title={pendingElementType ? `Confirm ${pendingElementType} creation` : 'Confirm creation'}
        okText="Create"
        cancelText="Cancel"
        onCancel={() => {
          setCreateModalOpen(false);
          setPendingElementType(null);
          setPlacement(null);
          form.resetFields();
        }}
        onOk={async () => {
          if (!pendingElementType) return;
          if (!eaRepository) return;
          try {
            const values = await form.validateFields();
            const name = String(values.name || '').trim();
            if (!name) {
              message.error('Name is required.');
              return;
            }

            setPendingElementDraft({
              type: pendingElementType,
              name,
              description: String(values.description || '').trim(),
              placement,
            });
            setAuditPreviewOpen(true);
          } catch {
            // validation errors handled by Form
          }
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="Enter name" autoFocus allowClear />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea placeholder="Optional description" rows={3} allowClear />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={auditPreviewOpen}
        title="Audit & Impact Preview"
        okText="Confirm and create"
        cancelText="Cancel"
        onCancel={() => {
          setAuditPreviewOpen(false);
          setPendingElementDraft(null);
        }}
        onOk={() => {
          if (!pendingElementDraft) return;
          stageElement({
            type: pendingElementDraft.type,
            name: pendingElementDraft.name,
            description: pendingElementDraft.description,
            placement: pendingElementDraft.placement,
          });

          setAuditPreviewOpen(false);
          setCreateModalOpen(false);
          setPendingElementType(null);
          setPlacement(null);
          setPendingElementDraft(null);
          form.resetFields();
          message.success(`${pendingElementDraft.type} staged in workspace.`);
        }}
      >
        <Typography.Text strong>Elements to be created</Typography.Text>
        <ul style={{ marginTop: 6, paddingLeft: 18 }}>
          <li>
            {pendingElementDraft
              ? `${pendingElementDraft.type}: ${pendingElementDraft.name || '(unnamed)'}`
              : '—'}
          </li>
        </ul>
        <Typography.Text strong>Relationships affected</Typography.Text>
        <ul style={{ marginTop: 6, paddingLeft: 18 }}>
          <li>None (no relationships will be created).</li>
        </ul>
        <Typography.Text strong>Impact summary</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ marginTop: 6 }}>
          New element will be staged in this workspace. Repository and views remain unchanged until you commit outside Studio.
        </Typography.Paragraph>
      </Modal>

    </div>
  );
};

export default StudioShell;
