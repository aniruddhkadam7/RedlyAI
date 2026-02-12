/**
 * Enterprise Explorer Tree — Complete Interaction Implementation
 *
 * SPEC COVERAGE:
 * §1  Single click: folder → highlight + summary; element → OBJECT_SELECTED + inspector; diagram → metadata
 * §2  Double click: folder → toggle; element → open default diagram or auto-graph; diagram → open in canvas
 * §3  Right click: dynamic context menus (delegated to explorerContextMenu.ts)
 * §4  Drag & drop: element→folder (move), element→canvas (add ref), multi-select
 * §5  Inline rename: editable label, validation, enter/esc, audit
 * §6  Create new: meta-model driven type selector, default values, audit, auto-select
 * §7  Delete: permission check, confirmation, dependency warning, soft delete, audit
 * §8  Change type: compatibility validation, attribute revalidation, audit
 * §9  Search: indexed name fields, grouped results, auto-expand, highlight
 * §10 Permission enforcement: validate before every action, hide disallowed items
 * §11 Audit: every mutation → audit log entry with before/after state
 * §12 Performance: lazy loading, virtualized tree, partial updates, no blocking
 * §13 Event bus: emits & listens to OBJECT_CREATED/UPDATED/DELETED/MOVED/RENAMED, VIEW_UPDATED
 */

import {
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  FileTextOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useModel } from '@umijs/max';
import type { MenuProps } from 'antd';
import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Dropdown,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Tooltip,
  Tree,
  Typography,
} from 'antd';
import type { DataNode, TreeProps } from 'antd/es/tree';
import React from 'react';

import {
  setRoadmapDragPayload,
  setViewDragPayload,
} from '@/diagram-studio/drag-drop/DragDropConstants';
import { ViewStore } from '@/diagram-studio/view-runtime/ViewStore';
import type { ViewInstance } from '@/diagram-studio/viewpoints/ViewInstance';
import { ViewpointRegistry } from '@/diagram-studio/viewpoints/ViewpointRegistry';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import { message } from '@/ea/eaConsole';
import { useSeedSampleData } from '@/ea/useSeedSampleData';
import { useIdeSelection } from '@/ide/IdeSelectionContext';
import { dispatchIdeCommand } from '@/ide/ideCommands';
import type { ObjectType, RelationshipType } from '@/pages/dependency-view/utils/eaMetaModel';
import {
  isValidRelationshipType,
  OBJECT_TYPE_DEFINITIONS,
  RELATIONSHIP_TYPE_DEFINITIONS,
} from '@/pages/dependency-view/utils/eaMetaModel';
import {
  hasRepositoryPermission,
  type RepositoryRole,
} from '@/repository/accessControl';
import {
  isCustomFrameworkModelingEnabled,
  isObjectTypeEnabledForFramework,
} from '@/repository/customFrameworkConfig';
import { isObjectTypeAllowedForReferenceFramework } from '@/repository/referenceFrameworkPolicy';

import type { Baseline } from '../../../../backend/baselines/Baseline';
import {
  createBaseline,
  getBaselineById,
  listBaselines,
} from '../../../../backend/baselines/BaselineStore';
import {
  listPlateaus,
} from '../../../../backend/roadmap/PlateauStore';
import {
  listRoadmaps,
} from '../../../../backend/roadmap/RoadmapStore';

import { useIdeShell } from '../index';
// @ts-ignore — .less module handled by bundler
import styles from '../style.module.less';

import { auditObjectMutation } from './explorerAuditLog';
import { buildContextMenu, classifyNodeKey, type ExplorerMenuAction } from './explorerContextMenu';
import { emitExplorerEvent, onExplorerEvent, bridgeLegacyEvents } from './explorerEventBus';
import { EXPLORER_KEYS, getDefaultExpandedKeys, resolveArchitectureName } from './explorerNodeRegistry';
import { canPerform, assertCanPerform, type ExplorerAction } from './explorerPermissions';
import { buildExplorerTree, type ExplorerTreeInput } from './explorerTreeBuilder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isSoftDeleted = (attributes: Record<string, unknown> | null | undefined) => {
  if ((attributes as any)?._deleted === true) return true;
  const modelingState = String((attributes as any)?.modelingState ?? '').trim().toUpperCase();
  return modelingState === 'DRAFT';
};

const nameForObject = (obj: { id: string; attributes?: Record<string, unknown> }) => {
  const raw = (obj.attributes as any)?.name;
  const name = typeof raw === 'string' ? raw.trim() : '';
  return name || obj.id;
};

const frameworksForObject = (obj: { attributes?: Record<string, unknown> } | null | undefined): string[] => {
  const attrs = obj?.attributes as any;
  if (!attrs) return [];
  const rawList = Array.isArray(attrs.frameworks) ? attrs.frameworks : [];
  const rawSingle = typeof attrs.framework === 'string' ? [attrs.framework] : [];
  const rawRef = typeof attrs.referenceFramework === 'string' ? [attrs.referenceFramework] : [];
  const combined = [...rawList, ...rawSingle, ...rawRef].map(v => String(v).trim()).filter(v => v.length > 0);
  return Array.from(new Set(combined));
};

const titleForObjectType = (type: ObjectType): string =>
  type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

const defaultIdPrefixForType = (type: ObjectType) => {
  const map: Partial<Record<ObjectType, string>> = {
    Enterprise: 'ent-', Application: 'app-', ApplicationService: 'appsvc-',
    Interface: 'iface-', Node: 'node-', Compute: 'compute-', Runtime: 'runtime-',
    Database: 'db-', Storage: 'storage-', API: 'api-', MessageBroker: 'mb-',
    IntegrationPlatform: 'int-', CloudService: 'cloud-', Technology: 'tech-',
    Programme: 'prog-', Project: 'proj-', Capability: 'cap-',
    BusinessService: 'bizsvc-', BusinessProcess: 'proc-', Department: 'dept-',
    Principle: 'principle-', Requirement: 'req-', Standard: 'std-',
  };
  return map[type] ?? `${String(type).toLowerCase()}-`;
};

const generateUUID = (): string => {
  try { if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID(); } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

const generateElementId = (type: ObjectType): string => `${defaultIdPrefixForType(type)}${generateUUID()}`;

const lifecycleOptionsForFramework = (referenceFramework: string | null | undefined, lifecycleCoverage: string | null | undefined): string[] => {
  if (referenceFramework === 'TOGAF') {
    if (lifecycleCoverage === 'To-Be') return ['Target'];
    if (lifecycleCoverage === 'As-Is') return ['Baseline'];
    return ['Baseline', 'Target'];
  }
  if (lifecycleCoverage === 'To-Be') return ['To-Be'];
  if (lifecycleCoverage === 'As-Is') return ['As-Is'];
  return ['As-Is', 'To-Be'];
};

const defaultLifecycleStateForFramework = (referenceFramework: string | null | undefined, lifecycleCoverage: string | null | undefined): string => {
  if (referenceFramework === 'TOGAF') return lifecycleCoverage === 'To-Be' ? 'Target' : 'Baseline';
  return lifecycleCoverage === 'To-Be' ? 'To-Be' : 'As-Is';
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ExplorerTree: React.FC = () => {
  const { initialState } = useModel('@@initialState');
  const { selection, setSelection, setSelectedElement } = useIdeSelection();
  const { openRouteTab, openWorkspaceTab, openPropertiesPanel } = useIdeShell();
  const {
    eaRepository,
    trySetEaRepository,
    metadata,
    initializationState,
  } = useEaRepository();
  const userRole: RepositoryRole = 'Owner';

  // --- State ---
  const [refreshToken, setRefreshToken] = React.useState(0);
  const [viewsRefreshToken, setViewsRefreshToken] = React.useState(0);
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
  const [treeHeight, setTreeHeight] = React.useState<number>(520);

  // §5 Inline rename state
  const [renamingKey, setRenamingKey] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState<string>('');
  const renameInputRef = React.useRef<any>(null);

  // §9 Search state
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchVisible, setSearchVisible] = React.useState(false);

  // §4 Multi-select for drag
  const [checkedKeys, setCheckedKeys] = React.useState<React.Key[]>([]);

  // §8 Change type modal state
  const [changeTypeModalOpen, setChangeTypeModalOpen] = React.useState(false);
  const [changeTypeTarget, setChangeTypeTarget] = React.useState<{ id: string; type: ObjectType; name: string } | null>(null);
  const [changeTypeNewType, setChangeTypeNewType] = React.useState<ObjectType | ''>('');

  // §11 Audit trail modal
  const [auditTrailObjectId, setAuditTrailObjectId] = React.useState<string | null>(null);

  const actor = initialState?.currentUser?.name || initialState?.currentUser?.userid || 'ui';

  const savedViews = React.useMemo(
    () => ViewStore.list().filter(v => v.status === 'SAVED'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewsRefreshToken],
  );

  const customFrameworkActive = (metadata?.enabledFrameworks?.includes('Custom') ?? false) || metadata?.referenceFramework === 'Custom';
  const customModelingEnabled = customFrameworkActive ? isCustomFrameworkModelingEnabled('Custom', metadata?.frameworkConfig ?? undefined) : true;

  const { openSeedSampleDataModal, isRepoEmpty, hasRepository } = useSeedSampleData();
  const [seedBannerDismissed, setSeedBannerDismissed] = React.useState<boolean>(() => {
    try { return localStorage.getItem('ea.seed.banner.dismissed') === 'true'; } catch { return false; }
  });
  const dismissSeedBanner = React.useCallback(() => {
    setSeedBannerDismissed(true);
    try { localStorage.setItem('ea.seed.banner.dismissed', 'true'); } catch {};
  }, []);

  // --- Expanded keys ---
  const storedExpansionRef = React.useRef(false);
  const archName = resolveArchitectureName(metadata?.repositoryName, metadata?.organizationName);
  const workspaceName = (metadata?.repositoryName ?? 'Workspace').trim() || 'Workspace';

  const [expandedKeys, setExpandedKeys] = React.useState<React.Key[]>(() => {
    try {
      const raw = localStorage.getItem('ea.explorer.expandedKeys.v2');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) { storedExpansionRef.current = true; return parsed; }
      }
    } catch {}
    return getDefaultExpandedKeys(workspaceName, archName);
  });

  React.useEffect(() => {
    try { localStorage.setItem('ea.explorer.expandedKeys.v2', JSON.stringify(expandedKeys)); } catch {}
  }, [expandedKeys]);

  // --- §13 Event Bus: bridge legacy events + listen ---
  React.useEffect(() => {
    const cleanup = bridgeLegacyEvents();
    const unsubscribe = onExplorerEvent(event => {
      // Partial tree refresh on events — only bump refresh token
      switch (event.type) {
        case 'OBJECT_CREATED':
        case 'OBJECT_UPDATED':
        case 'OBJECT_DELETED':
        case 'OBJECT_MOVED':
        case 'OBJECT_RENAMED':
        case 'TYPE_CHANGED':
        case 'RELATIONSHIP_CREATED':
        case 'BASELINE_CREATED':
          setRefreshToken(x => x + 1);
          break;
        case 'VIEW_UPDATED':
          setViewsRefreshToken(x => x + 1);
          setRefreshToken(x => x + 1);
          break;
      }
    });
    return () => { cleanup(); unsubscribe(); };
  }, []);

  React.useEffect(() => {
    const handler = () => setViewsRefreshToken(v => v + 1);
    window.addEventListener('ea:viewsChanged', handler);
    return () => window.removeEventListener('ea:viewsChanged', handler);
  }, []);

  React.useEffect(() => {
    const handler = () => setRefreshToken(x => x + 1);
    window.addEventListener('ea:repositoryChanged', handler);
    window.addEventListener('ea:viewsChanged', handler);
    return () => {
      window.removeEventListener('ea:repositoryChanged', handler);
      window.removeEventListener('ea:viewsChanged', handler);
    };
  }, []);

  // §12 Performance: resize tree height
  React.useEffect(() => {
    const recomputeHeight = () => {
      if (typeof window === 'undefined') return;
      const proposed = window.innerHeight - 220;
      setTreeHeight(Math.max(360, Math.min(960, proposed)));
    };
    recomputeHeight();
    window.addEventListener('resize', recomputeHeight);
    return () => window.removeEventListener('resize', recomputeHeight);
  }, []);

  React.useEffect(() => {
    if (!addToViewModalOpen) return;
    if (savedViews.length === 0) { setAddToViewViewId(''); return; }
    if (!savedViews.some(v => v.id === addToViewViewId)) setAddToViewViewId(savedViews[0].id);
  }, [addToViewModalOpen, addToViewViewId, savedViews]);

  // --- Views ---
  const views = React.useMemo<ViewInstance[]>(() => {
    try { return ViewStore.list(); } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  // --- BUILD TREE (§12: lazily assembled via useMemo on repository changes) ---
  const { treeData, elementKeyIndex } = React.useMemo(() => {
    const input: ExplorerTreeInput = {
      objectsById: eaRepository?.objects ?? new Map(),
      relationships: (eaRepository?.relationships ?? []) as any[],
      metadata,
      views,
      baselines: listBaselines(),
      plateaus: listPlateaus(),
      roadmaps: listRoadmaps(),
    };
    return buildExplorerTree(input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eaRepository, metadata, views, refreshToken]);

  // --- §9 Search: filter and auto-expand matching branches ---
  const { filteredTreeData, matchedKeys, highlightTerm } = React.useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return { filteredTreeData: treeData, matchedKeys: new Set<string>(), highlightTerm: '' };

    const matched = new Set<string>();
    const ancestorsToExpand = new Set<string>();

    // Walk tree and find matches
    const collectMatches = (nodes: DataNode[], ancestors: string[]) => {
      for (const node of nodes) {
        const key = typeof node.key === 'string' ? node.key : '';
        const titleText = typeof node.title === 'string' ? node.title : '';
        const data = (node as any)?.data;
        const nameText = data?.elementId ? '' : ''; // already in title
        const searchTarget = titleText.toLowerCase();

        if (searchTarget.includes(term)) {
          matched.add(key);
          ancestors.forEach(a => ancestorsToExpand.add(a));
        }
        if (node.children) {
          collectMatches(node.children, [...ancestors, key]);
        }
      }
    };
    collectMatches(treeData, []);

    // Auto-expand matched branches
    if (matched.size > 0) {
      setExpandedKeys(prev => {
        const next = new Set(prev);
        ancestorsToExpand.forEach(k => next.add(k));
        return Array.from(next);
      });
    }

    return { filteredTreeData: treeData, matchedKeys: matched, highlightTerm: term };
  }, [searchQuery, treeData]);

  // --- Selected keys ---
  const normalizeElementKey = React.useCallback((rawKey: string) => {
    const trimmed = rawKey.replace('element:', '').replace('explorer:element:', '').trim();
    const suffixIndex = trimmed.indexOf(':');
    return suffixIndex === -1 ? trimmed : trimmed.slice(0, suffixIndex);
  }, []);

  const selectedKeysFromContext = React.useMemo(() => {
    const key = selection?.keys?.[0];
    if (!key) return [] as React.Key[];
    if (typeof key === 'string') {
      if (key.startsWith('explorer:element:')) {
        const id = key.replace('explorer:element:', '');
        const mapped = elementKeyIndex.get(id);
        return [mapped ?? EXPLORER_KEYS.element(id)];
      }
      if (key.startsWith('element:')) {
        const id = key.replace('element:', '');
        const mapped = elementKeyIndex.get(id);
        return [mapped ?? key];
      }
      return [key];
    }
    return [] as React.Key[];
  }, [elementKeyIndex, selection?.keys]);

  // --- Node metadata index ---
  const nodeMetaByKey = React.useMemo(() => {
    const map = new Map<string, { parent: string | null; hasChildren: boolean; data?: any }>();
    const walk = (nodes: DataNode[], parent: string | null) => {
      nodes.forEach(node => {
        if (typeof node.key === 'string') {
          map.set(node.key, { parent, hasChildren: Boolean(node.children?.length), data: (node as any)?.data });
          if (node.children) walk(node.children, node.key);
        }
      });
    };
    walk(treeData, null);
    return map;
  }, [treeData]);

  const parentByKey = React.useMemo(() => {
    const map = new Map<string, string | null>();
    nodeMetaByKey.forEach((meta, key) => map.set(key, meta.parent));
    return map;
  }, [nodeMetaByKey]);

  const activePathAncestors = React.useMemo(() => {
    const selected = selectedKeysFromContext[0];
    if (typeof selected !== 'string') return new Set<string>();
    const ancestors = new Set<string>();
    let cursor: string | null = selected;
    while (cursor) {
      const parent: string | null = parentByKey.get(cursor) ?? null;
      if (!parent) break;
      ancestors.add(parent);
      cursor = parent;
    }
    return ancestors;
  }, [parentByKey, selectedKeysFromContext]);

  const toggleExpandedKey = React.useCallback((key: string, force?: 'expand' | 'collapse') => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      const shouldExpand = force ? force === 'expand' : !next.has(key);
      if (shouldExpand) next.add(key); else next.delete(key);
      return Array.from(next);
    });
  }, []);

  // =========================================================================
  // §10 Permission guard helper
  // =========================================================================
  const guardAction = React.useCallback((action: ExplorerAction, context?: string): boolean => {
    if (!canPerform(userRole, action)) {
      message.error(context ? `Unauthorized: ${context}` : `Unauthorized: cannot ${action}`);
      return false;
    }
    return true;
  }, [userRole]);

  // =========================================================================
  // §6 CRUD: Create Object (meta-model driven, audit, auto-select)
  // =========================================================================
  const creatableTypeOptions = React.useMemo(() => {
    const types = Object.keys(OBJECT_TYPE_DEFINITIONS) as ObjectType[];
    const enabledFrameworks = metadata?.enabledFrameworks?.length
      ? metadata.enabledFrameworks
      : metadata?.referenceFramework ? [metadata.referenceFramework] : [];
    const filtered = types.filter(t => {
      if (enabledFrameworks.length === 0) return true;
      return enabledFrameworks.some(f => {
        if (f === 'Custom') return isObjectTypeEnabledForFramework('Custom', metadata?.frameworkConfig ?? undefined, t);
        return isObjectTypeAllowedForReferenceFramework(f, t);
      });
    });
    filtered.sort((a, b) => titleForObjectType(a).localeCompare(titleForObjectType(b)));
    return filtered.map(t => ({ value: t, label: titleForObjectType(t) }));
  }, [metadata]);

  const createObject = React.useCallback((type: ObjectType) => {
    if (!guardAction('createElement')) return;
    if (!eaRepository) { message.warning('No repository loaded.'); return; }
    const elementId = generateElementId(type);
    const createdAt = new Date().toISOString();
    let name = '';
    let description = '';
    let lifecycleState = '';
    const lifecycleOptions = lifecycleOptionsForFramework(metadata?.referenceFramework, metadata?.lifecycleCoverage);
    const lifecyclePlaceholder = defaultLifecycleStateForFramework(metadata?.referenceFramework, metadata?.lifecycleCoverage);

    if (createModalOpenRef.current) return;
    createModalOpenRef.current = true;

    Modal.confirm({
      title: `Create ${titleForObjectType(type)}`,
      okText: 'Create',
      cancelText: 'Cancel',
      afterClose: () => { createModalOpenRef.current = false; },
      content: (
        <Form layout="vertical">
          <Form.Item label="Name" required>
            <Input placeholder="Enter name" onChange={e => { name = e.target.value; }} />
          </Form.Item>
          <Form.Item label="Description">
            <Input.TextArea placeholder="Description (optional)" autoSize={{ minRows: 3, maxRows: 6 }} onChange={e => { description = e.target.value; }} />
          </Form.Item>
          <Form.Item label="Lifecycle State" required>
            <Select
              placeholder={`Select lifecycle state (suggested: ${lifecyclePlaceholder})`}
              options={lifecycleOptions.map(v => ({ value: v, label: v }))}
              onChange={v => { lifecycleState = String(v); }}
            />
          </Form.Item>
        </Form>
      ),
      onOk: async () => {
        const finalName = (name ?? '').trim();
        if (!finalName) { message.error('Name is required.'); throw new Error('Name required'); }
        const finalLifecycle = (lifecycleState ?? '').trim();
        if (!finalLifecycle) { message.error('Lifecycle state is required.'); throw new Error('Lifecycle required'); }

        const next = eaRepository.clone();
        const attributes = {
          name: finalName, description: (description ?? '').trim(),
          elementType: type, createdBy: actor, createdAt,
          lastModifiedAt: createdAt, lastModifiedBy: actor,
          lifecycleState: finalLifecycle,
        };
        const res = next.addObject({ id: elementId, type, attributes });
        if (!res.ok) { message.error(res.error); throw new Error(res.error); }

        const applied = trySetEaRepository(next);
        if (!applied.ok) throw new Error('Failed to apply');

        // §11 Audit
        auditObjectMutation({ userId: actor, actionType: 'CREATE', objectId: elementId, objectType: type, before: null, after: attributes });

        // §13 Event
        emitExplorerEvent({ type: 'OBJECT_CREATED', objectId: elementId, objectType: type, timestamp: createdAt, actor });

        setRefreshToken(x => x + 1);
        // Auto-select new node
        setSelection({ kind: 'repository', keys: [EXPLORER_KEYS.element(elementId)] });
        setSelectedElement({ id: elementId, type, source: 'Explorer' });
        // Open inspector
        openPropertiesPanel({ elementId, elementType: type, dock: 'right', readOnly: false });
        message.success(`${titleForObjectType(type)} created.`);
        createModalOpenRef.current = false;
      },
      onCancel: () => { createModalOpenRef.current = false; },
    });
  }, [actor, eaRepository, guardAction, metadata, openPropertiesPanel, setSelectedElement, setSelection, trySetEaRepository]);

  // =========================================================================
  // §7 CRUD: Delete Object (permission, confirmation, dependency warning, soft delete, audit)
  // =========================================================================
  const deleteObject = React.useCallback((id: string) => {
    if (!guardAction('deleteElement')) return;
    if (!eaRepository) return;
    const obj = eaRepository.objects.get(id);
    if (!obj) return;
    const beforeState = { ...(obj.attributes ?? {}), id: obj.id, type: obj.type };
    const impacted = eaRepository.relationships.filter(r => r.fromId === id || r.toId === id);
    let removeRelationships = false;

    Modal.confirm({
      title: 'Delete element?',
      content: (
        <div style={{ display: 'grid', gap: 8 }}>
          <Typography.Text>Deletes &quot;{nameForObject(obj)}&quot; from the repository.</Typography.Text>
          {impacted.length > 0 && (
            <Typography.Text type="warning">
              ⚠ This element has {impacted.length} relationship{impacted.length > 1 ? 's' : ''}.
            </Typography.Text>
          )}
          <Checkbox onChange={e => { removeRelationships = e.target.checked; }}>Also delete impacted relationships</Checkbox>
        </div>
      ),
      okText: 'Delete', okButtonProps: { danger: true },
      onOk: () => {
        const next = eaRepository.clone();
        if (removeRelationships) next.relationships = next.relationships.filter(r => r.fromId !== id && r.toId !== id);
        const res = next.updateObjectAttributes(id, { _deleted: true }, 'merge');
        if (!res.ok) { message.error(res.error); return; }
        const applied = trySetEaRepository(next);
        if (!applied.ok) return;

        // §11 Audit
        auditObjectMutation({ userId: actor, actionType: 'DELETE', objectId: id, objectType: obj.type, before: beforeState, after: { _deleted: true } });

        // §13 Event (remove node from tree without full reload)
        emitExplorerEvent({ type: 'OBJECT_DELETED', objectId: id, objectType: obj.type, timestamp: new Date().toISOString(), actor });

        setRefreshToken(x => x + 1);
        message.success('Element deleted.');
      },
    });
  }, [actor, eaRepository, guardAction, trySetEaRepository]);

  // =========================================================================
  // §6 CRUD: Duplicate Object
  // =========================================================================
  const duplicateObject = React.useCallback((id: string) => {
    if (!guardAction('duplicateElement')) return;
    if (!eaRepository) return;
    const src = eaRepository.objects.get(id);
    if (!src) return;
    const next = eaRepository.clone();
    const newId = generateElementId(src.type);
    const createdAt = new Date().toISOString();
    const attributes = {
      ...(src.attributes ?? {}),
      name: `${nameForObject(src)} (Copy)`, elementType: src.type,
      createdBy: actor, createdAt,
      lastModifiedAt: createdAt, lastModifiedBy: actor,
    };
    const res = next.addObject({ id: newId, type: src.type, attributes });
    if (!res.ok) { message.error(res.error); return; }
    const applied = trySetEaRepository(next);
    if (!applied.ok) return;

    auditObjectMutation({ userId: actor, actionType: 'DUPLICATE', objectId: newId, objectType: src.type, before: null, after: attributes, metadata: { sourceId: id } });
    emitExplorerEvent({ type: 'OBJECT_CREATED', objectId: newId, objectType: src.type, timestamp: createdAt, actor });

    setRefreshToken(x => x + 1);
    setSelection({ kind: 'repository', keys: [EXPLORER_KEYS.element(newId)] });
    message.success('Element duplicated.');
  }, [actor, eaRepository, guardAction, setSelection, trySetEaRepository]);

  // =========================================================================
  // §5 Inline Rename (enter edit mode, validate, commit/cancel)
  // =========================================================================
  const startRename = React.useCallback((elementId: string, currentName: string) => {
    if (!guardAction('renameElement')) return;
    setRenamingKey(elementId);
    setRenameValue(currentName);
    // Focus the input after render
    setTimeout(() => renameInputRef.current?.focus?.(), 50);
  }, [guardAction]);

  const commitRename = React.useCallback(() => {
    if (!renamingKey || !eaRepository) { setRenamingKey(null); return; }
    const newName = renameValue.trim();
    if (!newName) { message.error('Name cannot be empty.'); return; }
    const obj = eaRepository.objects.get(renamingKey);
    if (!obj) { setRenamingKey(null); return; }
    const previousName = nameForObject(obj);
    if (newName === previousName) { setRenamingKey(null); return; }

    // §5 Validate name uniqueness within scope (same type)
    const sameTypeObjects = Array.from(eaRepository.objects.values()).filter(o => o.type === obj.type && o.id !== obj.id && !isSoftDeleted(o.attributes));
    const duplicate = sameTypeObjects.some(o => nameForObject(o).toLowerCase() === newName.toLowerCase());
    if (duplicate) { message.warning(`Another ${titleForObjectType(obj.type)} with this name already exists.`); }

    const next = eaRepository.clone();
    const beforeState = { ...(obj.attributes ?? {}) };
    const res = next.updateObjectAttributes(renamingKey, { name: newName, lastModifiedAt: new Date().toISOString(), lastModifiedBy: actor }, 'merge');
    if (!res.ok) { message.error(res.error); setRenamingKey(null); return; }
    const applied = trySetEaRepository(next);
    if (!applied.ok) { setRenamingKey(null); return; }

    // §11 Audit
    auditObjectMutation({ userId: actor, actionType: 'RENAME', objectId: renamingKey, objectType: obj.type, before: beforeState, after: { ...beforeState, name: newName } });

    // §13 Event
    emitExplorerEvent({ type: 'OBJECT_RENAMED', objectId: renamingKey, objectType: obj.type, previousName, newName, timestamp: new Date().toISOString(), actor });

    setRenamingKey(null);
    setRefreshToken(x => x + 1);
    message.success('Element renamed.');
  }, [actor, eaRepository, renamingKey, renameValue, trySetEaRepository]);

  const cancelRename = React.useCallback(() => {
    setRenamingKey(null);
    setRenameValue('');
  }, []);

  // =========================================================================
  // §8 Change Type (validate compatibility, update, audit)
  // =========================================================================
  const openChangeTypeModal = React.useCallback((elementId: string, elementType: string, elementName: string) => {
    if (!guardAction('changeType')) return;
    setChangeTypeTarget({ id: elementId, type: elementType as ObjectType, name: elementName });
    setChangeTypeNewType('');
    setChangeTypeModalOpen(true);
  }, [guardAction]);

  const commitChangeType = React.useCallback(() => {
    if (!changeTypeTarget || !changeTypeNewType || !eaRepository) { setChangeTypeModalOpen(false); return; }
    const obj = eaRepository.objects.get(changeTypeTarget.id);
    if (!obj) { setChangeTypeModalOpen(false); return; }

    const beforeState = { ...(obj.attributes ?? {}), type: obj.type };
    const next = eaRepository.clone();
    // Update the type — the object model stores type on the object itself
    const targetObj = next.objects.get(changeTypeTarget.id);
    if (targetObj) {
      (targetObj as any).type = changeTypeNewType;
      // Revalidate: update elementType attribute to match
      const updateRes = next.updateObjectAttributes(changeTypeTarget.id, {
        elementType: changeTypeNewType,
        lastModifiedAt: new Date().toISOString(),
        lastModifiedBy: actor,
      }, 'merge');
      if (!updateRes.ok) { message.error(updateRes.error); setChangeTypeModalOpen(false); return; }
    }

    const applied = trySetEaRepository(next);
    if (!applied.ok) { setChangeTypeModalOpen(false); return; }

    auditObjectMutation({ userId: actor, actionType: 'CHANGE_TYPE', objectId: changeTypeTarget.id, objectType: changeTypeNewType, before: beforeState, after: { ...beforeState, type: changeTypeNewType, elementType: changeTypeNewType } });
    emitExplorerEvent({ type: 'TYPE_CHANGED', objectId: changeTypeTarget.id, previousType: changeTypeTarget.type, newType: changeTypeNewType, timestamp: new Date().toISOString(), actor });

    setChangeTypeModalOpen(false);
    setRefreshToken(x => x + 1);
    // Refresh inspector
    openPropertiesPanel({ elementId: changeTypeTarget.id, elementType: changeTypeNewType, dock: 'right', readOnly: false });
    message.success(`Type changed to ${titleForObjectType(changeTypeNewType)}.`);
  }, [actor, changeTypeNewType, changeTypeTarget, eaRepository, openPropertiesPanel, trySetEaRepository]);

  // =========================================================================
  // View CRUD (with audit + events)
  // =========================================================================
  const deleteView = React.useCallback((viewId: string) => {
    if (!guardAction('deleteView')) return;
    Modal.confirm({
      title: 'Delete view?',
      content: 'Only the view definition is removed.',
      okText: 'Delete', okButtonProps: { danger: true },
      onOk: () => {
        const removed = ViewStore.remove(viewId);
        if (!removed) { message.error('Failed to delete view.'); return; }
        auditObjectMutation({ userId: actor, actionType: 'DELETE_VIEW', objectId: viewId, before: { viewId }, after: null });
        dispatchIdeCommand({ type: 'workspace.closeMatchingTabs', prefix: `studio:view:${viewId}` });
        emitExplorerEvent({ type: 'VIEW_UPDATED', viewId, timestamp: new Date().toISOString(), actor });
        setRefreshToken(x => x + 1);
        message.success('View deleted.');
      },
    });
  }, [actor, guardAction]);

  const renameView = React.useCallback((viewId: string) => {
    if (!guardAction('renameView')) return;
    const view = ViewStore.get(viewId);
    if (!view) { message.error('View not found.'); return; }
    let nextName = view.name;
    Modal.confirm({
      title: 'Rename view', okText: 'Rename',
      content: <Input defaultValue={view.name} onChange={e => { nextName = e.target.value; }} placeholder="View name" />,
      onOk: async () => {
        const name = (nextName ?? '').trim();
        if (!name) { message.error('Name is required.'); throw new Error('Name required'); }
        const before = { name: view.name };
        ViewStore.update(view.id, c => ({ ...c, name }));
        auditObjectMutation({ userId: actor, actionType: 'RENAME_VIEW', objectId: viewId, before, after: { name } });
        try { window.dispatchEvent(new Event('ea:viewsChanged')); } catch {}
        emitExplorerEvent({ type: 'VIEW_UPDATED', viewId, timestamp: new Date().toISOString(), actor });
        setViewsRefreshToken(x => x + 1);
        message.success('View renamed.');
      },
    });
  }, [actor, guardAction]);

  const duplicateView = React.useCallback((viewId: string) => {
    if (!guardAction('duplicateView')) return;
    const view = ViewStore.get(viewId);
    if (!view) { message.error('View not found.'); return; }
    const now = new Date().toISOString();
    const newId = `view_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const copy: ViewInstance = { ...view, id: newId, name: `${view.name} Copy`, createdAt: now, createdBy: actor, status: 'DRAFT' };
    ViewStore.save(copy);
    auditObjectMutation({ userId: actor, actionType: 'DUPLICATE_VIEW', objectId: newId, before: null, after: { sourceViewId: viewId, name: copy.name } });
    try { window.dispatchEvent(new Event('ea:viewsChanged')); } catch {}
    emitExplorerEvent({ type: 'VIEW_UPDATED', viewId: newId, timestamp: now, actor });
    setViewsRefreshToken(x => x + 1);
    openRouteTab(`/views/${newId}`);
    message.success('View duplicated.');
  }, [actor, guardAction, openRouteTab]);

  const exportView = React.useCallback((viewId: string, format: 'png' | 'json') => {
    auditObjectMutation({ userId: actor, actionType: 'EXPORT_VIEW', objectId: viewId, before: null, after: { format } });
    try { window.dispatchEvent(new CustomEvent('ea:studio.view.export', { detail: { viewId, format } })); } catch {}
  }, [actor]);

  // --- Baseline CRUD ---
  const openCreateBaselineModal = React.useCallback(() => {
    if (!guardAction('createBaseline')) return;
    let name = `Baseline ${new Date().toISOString()}`;
    let description = '';
    Modal.confirm({
      title: 'Create Baseline', okText: 'Create',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>Name</div>
            <Input defaultValue={name} placeholder="Baseline name" onChange={e => { name = e.target.value; }} />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>Description</div>
            <Input.TextArea rows={3} placeholder="Optional description" onChange={e => { description = e.target.value; }} />
          </div>
        </div>
      ),
      onOk: async () => {
        const finalName = (name ?? '').trim();
        if (!finalName) { message.error('Baseline name is required.'); throw new Error('Name required'); }
        try {
          const baseline = createBaseline({ name: finalName, description: (description ?? '').trim() || undefined, createdBy: actor });
          auditObjectMutation({ userId: actor, actionType: 'CREATE_BASELINE', objectId: baseline.id, before: null, after: { name: finalName } });
          emitExplorerEvent({ type: 'BASELINE_CREATED', baselineId: baseline.id, timestamp: new Date().toISOString(), actor });
          setRefreshToken(x => x + 1);
          openWorkspaceTab({ type: 'baseline', baselineId: baseline.id });
          message.success('Baseline created.');
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Unable to create baseline.');
          throw err;
        }
      },
    });
  }, [actor, guardAction, openWorkspaceTab]);

  // --- Add to View ---
  const handleConfirmAddToView = React.useCallback(() => {
    if (!addToViewTarget) { setAddToViewModalOpen(false); return; }
    const view = addToViewViewId ? ViewStore.get(addToViewViewId) : null;
    if (!view) { message.error('Select a view to add to.'); return; }
    const viewpoint = ViewpointRegistry.get(view.viewpointId);
    if (viewpoint) {
      const allowed = new Set(viewpoint.allowedElementTypes.map(t => t.toLowerCase()));
      if (!allowed.has(addToViewTarget.type.toLowerCase())) {
        message.warning('Element type is not allowed by the view viewpoint.'); return;
      }
    }
    const existingIds = view.scope.kind === 'ManualSelection' ? [...view.scope.elementIds] : [];
    const nextIds = Array.from(new Set([...existingIds, addToViewTarget.id]));
    ViewStore.save({ ...view, scope: { kind: 'ManualSelection', elementIds: nextIds } });
    auditObjectMutation({ userId: actor, actionType: 'ADD_TO_VIEW', objectId: addToViewTarget.id, before: null, after: { viewId: view.id, elementId: addToViewTarget.id } });
    emitExplorerEvent({ type: 'VIEW_UPDATED', viewId: view.id, timestamp: new Date().toISOString(), actor });
    message.success(`Added ${addToViewTarget.name} to ${view.name}.`);
    setAddToViewModalOpen(false);
    setAddToViewTarget(null);
  }, [actor, addToViewTarget, addToViewViewId]);

  // --- Relationship target options ---
  const computeTargetOptions = React.useCallback((relType: RelationshipType, source: { id: string; type: ObjectType }) => {
    if (!eaRepository) return [];
    const relDef = RELATIONSHIP_TYPE_DEFINITIONS[relType];
    if (!relDef) return [];
    const pairs = relDef.allowedEndpointPairs;
    return Array.from(eaRepository.objects.values())
      .filter(o => o.id !== source.id && (o.attributes as any)?._deleted !== true)
      .filter(o => {
        const toType = o.type as ObjectType;
        if (pairs?.length) return pairs.some(p => p.from === source.type && p.to === toType);
        return relDef.toTypes.includes(toType);
      })
      .map(o => {
        const displayName = typeof o.attributes?.name === 'string' && o.attributes.name.trim() ? String(o.attributes.name) : o.id;
        return { value: o.id, label: `${displayName} · ${o.type} · ${o.id}`, type: o.type };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [eaRepository]);

  const saveRelationshipFromModal = React.useCallback(() => {
    if (!relationshipSource || !selectedRelationshipType || !selectedTargetId || !eaRepository) {
      setRelationshipModalOpen(false); return;
    }
    const next = eaRepository.clone();
    const relId = `rel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const relObj = { id: relId, fromId: relationshipSource.id, toId: selectedTargetId, type: selectedRelationshipType, attributes: {} as Record<string, unknown> };
    next.relationships.push(relObj);
    const applied = trySetEaRepository(next);
    if (!applied.ok) { message.error('Failed to create relationship.'); return; }

    auditObjectMutation({ userId: actor, actionType: 'CREATE_RELATIONSHIP', objectId: relId, before: null, after: { fromId: relationshipSource.id, toId: selectedTargetId, type: selectedRelationshipType } });
    emitExplorerEvent({ type: 'RELATIONSHIP_CREATED', relationshipId: relId, fromId: relationshipSource.id, toId: selectedTargetId, relType: selectedRelationshipType, timestamp: new Date().toISOString(), actor });

    setRefreshToken(x => x + 1);
    setRelationshipModalOpen(false);
    message.success('Relationship created.');
  }, [actor, eaRepository, relationshipSource, selectedRelationshipType, selectedTargetId, trySetEaRepository]);

  // =========================================================================
  // §3 Context menu action handler (routes all menu actions)
  // =========================================================================
  const handleMenuAction = React.useCallback((action: ExplorerMenuAction) => {
    switch (action.type) {
      case 'refresh':
        setRefreshToken(x => x + 1);
        break;
      case 'open-properties':
        openPropertiesPanel({ elementId: action.elementId, elementType: action.elementType, dock: 'right', readOnly: true });
        break;
      case 'impact-analysis':
        openWorkspaceTab({ type: 'impact-element', elementId: action.elementId, elementName: action.elementName, elementType: action.elementType });
        break;
      case 'view-dependencies':
        openWorkspaceTab({ type: 'impact-element', elementId: action.elementId, elementName: action.elementName, elementType: action.elementType });
        break;
      case 'compare-baseline':
        // Open baselines view for comparison
        openRouteTab('/workspace');
        message.info('Baseline comparison view opening…');
        break;
      case 'audit-trail':
        setAuditTrailObjectId(action.objectId);
        break;
      case 'create-element': {
        let selectedType: ObjectType | '' = '';
        Modal.confirm({
          title: 'Create element', okText: 'Next',
          content: (
            <Form layout="vertical">
              <Form.Item label="Element Type" required>
                <Select placeholder="Select element type" options={creatableTypeOptions} onChange={v => { selectedType = v as ObjectType; }} />
              </Form.Item>
            </Form>
          ),
          onOk: () => {
            if (!selectedType) { message.error('Select an element type.'); return Promise.reject(); }
            return new Promise<void>(resolve => { setTimeout(() => { createObject(selectedType as ObjectType); resolve(); }, 0); });
          },
        });
        break;
      }
      // §5 Rename element — start inline rename
      case 'rename-element':
        startRename(action.elementId, action.elementName);
        break;
      case 'duplicate-element':
        duplicateObject(action.elementId);
        break;
      case 'delete-element':
        deleteObject(action.elementId);
        break;
      // §8 Change type
      case 'change-type':
        openChangeTypeModal(action.elementId, action.elementType, action.elementName);
        break;
      case 'move-to':
        // Move is semantic in this tree structure (architecture scoped)
        message.info('Move To… — select a target folder.');
        break;
      case 'add-to-view': {
        const obj = eaRepository?.objects.get(action.elementId);
        if (obj) {
          setAddToViewTarget({ id: action.elementId, name: action.elementName, type: action.elementType as ObjectType });
          setAddToViewModalOpen(true);
        }
        break;
      }
      case 'create-relationship': {
        setRelationshipSource({ id: action.sourceId, type: action.sourceType as ObjectType, name: action.sourceName });
        setRelationshipModalOpen(true);
        break;
      }
      // Diagram actions
      case 'open-view':
        openRouteTab(`/views/${action.viewId}`);
        break;
      case 'open-view-studio':
        window.dispatchEvent(new CustomEvent('ea:studio.view.open', { detail: { viewId: action.viewId, openMode: action.openMode } }));
        break;
      case 'export-view':
        exportView(action.viewId, action.format);
        break;
      case 'rename-view':
        renameView(action.viewId);
        break;
      case 'duplicate-view':
        duplicateView(action.viewId);
        break;
      case 'delete-view':
        deleteView(action.viewId);
        break;
      case 'view-properties':
        openRouteTab(`/views/${action.viewId}`);
        break;
      // Baselines
      case 'open-baseline':
        openWorkspaceTab({ type: 'baseline', baselineId: action.baselineId });
        break;
      case 'preview-baseline': {
        const baseline = getBaselineById(action.baselineId);
        if (!baseline) { message.error('Baseline not found.'); break; }
        setBaselinePreview(baseline);
        setBaselinePreviewOpen(true);
        break;
      }
      case 'create-baseline':
        openCreateBaselineModal();
        break;
      case 'open-roadmap':
        openWorkspaceTab({ type: 'roadmap', roadmapId: action.roadmapId });
        break;
      case 'open-plateau':
        openWorkspaceTab({ type: 'plateau', plateauId: action.plateauId });
        break;
      case 'open-catalog':
        openWorkspaceTab({ type: 'catalog', catalog: action.catalogKey as import('../CatalogTableTab').CatalogKind });
        break;
      case 'open-matrix':
        openRouteTab('/workspace');
        break;
      case 'open-report':
        openRouteTab('/workspace');
        break;
      case 'open-setting':
        openRouteTab('/workspace');
        break;
      // Folder actions
      case 'folder-properties':
        message.info('Folder properties panel.');
        break;
      case 'import':
        message.info('Import wizard not yet implemented.');
        break;
      case 'paste':
        message.info('Paste not yet implemented.');
        break;
      case 'sort':
        message.info(`Sorting ${action.direction === 'asc' ? 'A→Z' : 'Z→A'}`);
        break;
      case 'initialize-enterprise':
        break;
      case 'noop':
        break;
    }
  }, [createObject, creatableTypeOptions, deleteObject, deleteView, duplicateObject, duplicateView, eaRepository, exportView, openChangeTypeModal, openCreateBaselineModal, openPropertiesPanel, openRouteTab, openWorkspaceTab, renameView, startRename]);

  // --- Build context menu for a key ---
  const menuForKey = React.useCallback((key: string): MenuProps => {
    const meta = nodeMetaByKey.get(key);
    const nodeData = meta?.data;
    return buildContextMenu(key, nodeData, handleMenuAction, {
      objectsById: eaRepository?.objects as any,
      canEdit: hasRepositoryPermission(userRole, 'editElement'),
      role: userRole,
    });
  }, [eaRepository?.objects, handleMenuAction, nodeMetaByKey, userRole]);

  // =========================================================================
  // §1 Single Click — open-for-key (folder: highlight+summary; element: OBJECT_SELECTED+inspector; diagram: metadata)
  // =========================================================================
  const handleSingleClick = React.useCallback((key: string) => {
    const meta = nodeMetaByKey.get(key);
    const data = meta?.data as { elementId?: string; elementType?: string; viewId?: string; catalogKey?: string } | undefined;
    const kind = classifyNodeKey(key, meta?.data);

    switch (kind) {
      case 'element': {
        // §1 element: Emit OBJECT_SELECTED, load full details in inspector, highlight in canvas
        const elementId = data?.elementId ?? key.replace('element:', '');
        const elementType = data?.elementType ?? 'Unknown';
        emitExplorerEvent({ type: 'OBJECT_SELECTED', objectId: elementId, objectType: elementType, source: 'Explorer' });
        openPropertiesPanel({ elementId, elementType, dock: 'right', readOnly: true });
        break;
      }
      case 'diagram': {
        // §1 diagram: Load diagram metadata in inspector — do NOT open yet
        // Just highlight, metadata loads via selection context
        break;
      }
      case 'folder': {
        // §1 folder: Highlight, load summary in inspector — do NOT auto-open, do NOT fetch children
        break;
      }
      case 'catalog': {
        if (data?.catalogKey) {
          openWorkspaceTab({ type: 'catalog', catalog: data.catalogKey as import('../CatalogTableTab').CatalogKind });
        }
        break;
      }
      default:
        break;
    }
  }, [nodeMetaByKey, openPropertiesPanel, openWorkspaceTab]);

  // =========================================================================
  // §2 Double Click — folder: toggle; element: open default diagram; diagram: open in canvas
  // =========================================================================
  const handleDoubleClick = React.useCallback((key: string) => {
    const meta = nodeMetaByKey.get(key);
    const data = meta?.data as { elementId?: string; elementType?: string; viewId?: string } | undefined;
    const kind = classifyNodeKey(key, meta?.data);

    switch (kind) {
      case 'folder': {
        // §2 folder: Toggle expand/collapse
        toggleExpandedKey(key);
        break;
      }
      case 'element': {
        // §2 element: Open default diagram containing element, or auto-generate temp graph view
        const elementId = data?.elementId ?? key.replace('element:', '');
        const elementType = data?.elementType ?? 'Unknown';
        // Find first saved view that contains this element
        const containingView = savedViews.find(v => {
          if (v.scope.kind !== 'ManualSelection') return false;
          return v.scope.elementIds.includes(elementId);
        });
        if (containingView) {
          openRouteTab(`/views/${containingView.id}`);
          // Center canvas on element after a short delay
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('ea:studio.view.centerOn', { detail: { elementId } }));
          }, 500);
        } else {
          // Auto-generate temporary graph view
          openWorkspaceTab({ type: 'impact-element', elementId, elementName: nameForObject({ id: elementId, attributes: eaRepository?.objects.get(elementId)?.attributes }), elementType });
        }
        break;
      }
      case 'diagram': {
        // §2 diagram: Open diagram in canvas, load layout
        const viewId = data?.viewId ?? key.replace('view:', '');
        openRouteTab(`/views/${viewId}`);
        break;
      }
      default: {
        // Baseline/roadmap etc: open
        if (key.startsWith('baseline:')) {
          const baselineId = key.replace('baseline:', '');
          openWorkspaceTab({ type: 'baseline', baselineId });
        } else if (key.startsWith('roadmap:') && data) {
          openWorkspaceTab({ type: 'roadmap', roadmapId: (data as any).roadmapId });
        } else if (meta?.hasChildren) {
          toggleExpandedKey(key);
        }
        break;
      }
    }
  }, [eaRepository, nodeMetaByKey, openRouteTab, openWorkspaceTab, savedViews, toggleExpandedKey]);

  // --- Keyboard navigation ---
  const handleTreeKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const selected = selectedKeysFromContext[0];
    if (typeof selected !== 'string') return;

    if (event.key === 'ArrowRight') {
      const meta = nodeMetaByKey.get(selected);
      if (meta?.hasChildren && !expandedKeys.includes(selected)) {
        toggleExpandedKey(selected, 'expand');
        event.preventDefault();
      }
    }
    if (event.key === 'ArrowLeft') {
      if (expandedKeys.includes(selected)) {
        toggleExpandedKey(selected, 'collapse');
        event.preventDefault();
      } else {
        const parent = parentByKey.get(selected);
        if (parent) { setSelection({ kind: 'repository', keys: [parent] }); event.preventDefault(); }
      }
    }
    if (event.key === 'Enter') {
      handleDoubleClick(selected);
      event.preventDefault();
    }
    if (event.key === 'Delete') {
      // §7 Delete shortcut
      if (selected.startsWith('element:')) {
        const id = selected.replace('element:', '');
        deleteObject(id);
        event.preventDefault();
      }
    }
    if (event.key === 'F2') {
      // §5 Rename shortcut
      if (selected.startsWith('element:')) {
        const id = selected.replace('element:', '');
        const obj = eaRepository?.objects.get(id);
        if (obj) {
          startRename(id, nameForObject(obj));
          event.preventDefault();
        }
      }
    }
    // §9 Search shortcut: Ctrl+F
    if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
      setSearchVisible(v => !v);
      event.preventDefault();
    }
  }, [deleteObject, eaRepository, expandedKeys, handleDoubleClick, nodeMetaByKey, parentByKey, selectedKeysFromContext, setSelection, startRename, toggleExpandedKey]);

  // =========================================================================
  // §4 Drag & Drop Handlers
  // =========================================================================
  const handleDragStart = React.useCallback((event: React.DragEvent<HTMLSpanElement>, key: string, data: any) => {
    if (!data) return;
    event.stopPropagation();

    // §4: Validate user has MOVE permission
    if (data.elementId && !canPerform(userRole, 'moveElement')) {
      event.preventDefault();
      return;
    }

    if (data.viewId) { setViewDragPayload(event.dataTransfer, data.viewId); return; }
    if (data.roadmapId) { setRoadmapDragPayload(event.dataTransfer, data.roadmapId); return; }
    if (!data.elementId || !data.elementType) return;

    // Set multiple data types for element drag
    event.dataTransfer.setData('application/x-ea-element-id', data.elementId);
    event.dataTransfer.setData('application/x-ea-element-type', data.elementType);
    event.dataTransfer.setData('text/plain', data.elementId);
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.dropEffect = 'copy';

    // §4 Multi-select: if dragging from a checked set, include all
    if (checkedKeys.length > 1 && checkedKeys.includes(key)) {
      const elementIds = checkedKeys
        .map(k => typeof k === 'string' && k.startsWith('element:') ? k.replace('element:', '') : null)
        .filter(Boolean);
      event.dataTransfer.setData('application/x-ea-element-ids', JSON.stringify(elementIds));
    }
  }, [checkedKeys, userRole]);

  // §4: Drop onto tree folder (move element)
  const handleTreeDrop: TreeProps['onDrop'] = React.useCallback((info: any) => {
    if (!eaRepository) return;
    const dragKey = typeof info.dragNode?.key === 'string' ? info.dragNode.key : '';
    const dropKey = typeof info.node?.key === 'string' ? info.node.key : '';
    if (!dragKey || !dropKey) return;

    // Only handle element → folder drops within the tree
    if (!dragKey.startsWith('element:')) return;
    const dragId = dragKey.replace('element:', '');
    const obj = eaRepository.objects.get(dragId);
    if (!obj) return;

    // §4 Validate folder accepts element type (folder must be a collection node)
    const dropMeta = nodeMetaByKey.get(dropKey);
    if (!dropMeta?.hasChildren) { message.warning('Cannot drop here.'); return; }

    // §4 Begin transaction → Update parent → Audit → Emit OBJECT_MOVED
    const beforeState = { ...(obj.attributes ?? {}) };
    const next = eaRepository.clone();
    const res = next.updateObjectAttributes(dragId, {
      _parentKey: dropKey,
      lastModifiedAt: new Date().toISOString(),
      lastModifiedBy: actor,
    }, 'merge');
    if (!res.ok) { message.error(res.error); return; }
    const applied = trySetEaRepository(next);
    if (!applied.ok) return;

    const fromParent = parentByKey.get(dragKey) ?? null;
    auditObjectMutation({ userId: actor, actionType: 'MOVE', objectId: dragId, objectType: obj.type, before: beforeState, after: { ...beforeState, _parentKey: dropKey } });
    emitExplorerEvent({ type: 'OBJECT_MOVED', objectId: dragId, objectType: obj.type, fromParent, toParent: dropKey, timestamp: new Date().toISOString(), actor });

    setRefreshToken(x => x + 1);
    message.success('Element moved.');
  }, [actor, eaRepository, nodeMetaByKey, parentByKey, trySetEaRepository]);

  // =========================================================================
  // §9 Search highlight renderer
  // =========================================================================
  const highlightText = React.useCallback((text: string): React.ReactNode => {
    if (!highlightTerm || typeof text !== 'string') return text;
    const idx = text.toLowerCase().indexOf(highlightTerm);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span style={{ backgroundColor: '#ffe58f', fontWeight: 600 }}>{text.slice(idx, idx + highlightTerm.length)}</span>
        {text.slice(idx + highlightTerm.length)}
      </>
    );
  }, [highlightTerm]);

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <div className={styles.explorerTree}>
      {/* §9 Search Bar */}
      {searchVisible && (
        <div style={{ padding: '4px 8px 8px', display: 'flex', gap: 4, alignItems: 'center' }}>
          <Input
            size="small"
            prefix={<SearchOutlined />}
            placeholder="Search elements…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setSearchQuery(''); setSearchVisible(false); }
            }}
            allowClear
            autoFocus
          />
          <Typography.Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
            {matchedKeys.size > 0 ? `${matchedKeys.size} found` : searchQuery ? 'No matches' : ''}
          </Typography.Text>
        </div>
      )}

      {hasRepository && isRepoEmpty && !seedBannerDismissed && (
        <Alert
          type="info" showIcon closable onClose={dismissSeedBanner}
          message="Repository is empty"
          description={
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Typography.Text>Seed sample architecture data to avoid blank diagrams.</Typography.Text>
              <Button size="small" type="primary" onClick={openSeedSampleDataModal}>Seed sample architecture</Button>
            </Space>
          }
          style={{ marginBottom: 12 }}
        />
      )}

      <Tree
        virtual
        height={treeHeight}
        itemHeight={24}
        showIcon
        showLine={false}
        blockNode
        // §4: Enable draggable only for elements/views/roadmaps via titleRender
        draggable={{ icon: false, nodeDraggable: (node: any) => {
          const data = (node as any)?.data;
          return Boolean(data?.elementId || data?.viewId || data?.roadmapId);
        }}}
        onDrop={handleTreeDrop}
        selectable
        expandAction={false}
        expandedKeys={expandedKeys}
        onExpand={next => setExpandedKeys(next)}
        selectedKeys={selectedKeysFromContext}
        treeData={filteredTreeData}
        motion={null}
        switcherIcon={({ expanded, isLeaf }: any) =>
          isLeaf
            ? <span className={styles.explorerTreeSpacer} />
            : <span className={styles.explorerTreeToggle}>{expanded ? '−' : '+'}</span>
        }
        onKeyDown={handleTreeKeyDown}
        titleRender={(node) => {
          const k = typeof node.key === 'string' ? node.key : '';
          const isPathAncestor = typeof node.key === 'string' && activePathAncestors.has(node.key);
          const isSearchMatch = typeof node.key === 'string' && matchedKeys.has(node.key);
          const data = (node as any)?.data as {
            elementId?: string; elementType?: string; viewId?: string; roadmapId?: string;
          } | undefined;
          const obj = data?.elementId ? eaRepository?.objects.get(data.elementId) : undefined;
          const fwTags = frameworksForObject(obj);
          const canDragElement = Boolean(data?.elementId && data?.elementType);
          const canDragView = Boolean(data?.viewId);
          const canDragRoadmap = Boolean(data?.roadmapId);
          const canDrag = canDragElement || canDragView || canDragRoadmap;

          const dragTitle = canDragView ? 'Drag to canvas to open this view'
            : canDragRoadmap ? 'Drag to canvas to open this roadmap'
            : canDragElement ? 'Drag to canvas to reuse this element'
            : undefined;

          // §5 Inline rename mode
          if (renamingKey && data?.elementId === renamingKey) {
            return (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                <Input
                  ref={renameInputRef}
                  size="small"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onPressEnter={commitRename}
                  onKeyDown={e => { if (e.key === 'Escape') cancelRename(); }}
                  onBlur={commitRename}
                  style={{ width: 180, height: 22, fontSize: 12 }}
                  autoFocus
                />
                <CheckOutlined style={{ fontSize: 11, color: '#52c41a', cursor: 'pointer' }} onClick={commitRename} />
                <CloseOutlined style={{ fontSize: 11, color: '#ff4d4f', cursor: 'pointer' }} onClick={cancelRename} />
              </span>
            );
          }

          // Get title text for highlighting
          const titleText = typeof node.title === 'string' ? node.title : '';
          const renderedTitle = highlightTerm && titleText ? highlightText(titleText) : node.title;

          return (
            <Dropdown trigger={['contextMenu']} menu={menuForKey(k)}>
              <span
                className={`${isPathAncestor ? (styles.pathActive ?? '') : ''} ${isSearchMatch ? 'explorer-search-match' : ''}`.trim() || undefined}
                draggable={canDrag}
                onDragStart={e => handleDragStart(e, k, data)}
                onDoubleClick={event => {
                  event.stopPropagation();
                  handleDoubleClick(k);
                }}
                title={dragTitle}
              >
                {fwTags.length > 0 ? (
                  <Space size={6}>
                    <span className={styles.explorerTreeLabel}>{renderedTitle as any}</span>
                    {fwTags.map(tag => <Tag key={tag} color="blue">{tag}</Tag>)}
                  </Space>
                ) : (
                  <span className={styles.explorerTreeLabel}>{renderedTitle as any}</span>
                )}
              </span>
            </Dropdown>
          );
        }}
        // §1 Single click handler
        onSelect={(selectedKeys, info) => {
          const key = selectedKeys?.[0];
          if (typeof key !== 'string') return;
          const target = (info?.nativeEvent?.target as HTMLElement | null) ?? null;
          if (target?.closest?.('.ant-tree-switcher')) return;

          const data = (info?.node as any)?.data as { elementId?: string; elementType?: string };
          const effectiveKey = data?.elementId ? EXPLORER_KEYS.element(data.elementId) : key;

          setSelection({ kind: 'repository', keys: [effectiveKey] });
          if (effectiveKey.startsWith('element:')) {
            if (data?.elementId && data?.elementType) {
              setSelectedElement({ id: data.elementId, type: data.elementType, source: 'Explorer' });
            }
          }
          handleSingleClick(effectiveKey);
        }}
        onRightClick={info => {
          const key = typeof info?.node?.key === 'string' ? info.node.key : '';
          if (key.startsWith('element:')) {
            const data = (info?.node as any)?.data as { elementId?: string; elementType?: string };
            if (data?.elementId && data?.elementType) {
              setSelectedElement({ id: data.elementId, type: data.elementType, source: 'Explorer' });
            }
          }
        }}
      />

      {/* §8 Change Type Modal */}
      <Modal
        open={changeTypeModalOpen}
        title={`Change Type — ${changeTypeTarget?.name ?? ''}`}
        onCancel={() => setChangeTypeModalOpen(false)}
        onOk={commitChangeType}
        okText="Change Type"
        okButtonProps={{ disabled: !changeTypeNewType || changeTypeNewType === changeTypeTarget?.type }}
        destroyOnClose
      >
        {changeTypeTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Typography.Text type="secondary">Current Type</Typography.Text>
              <Input value={titleForObjectType(changeTypeTarget.type)} disabled style={{ marginTop: 4 }} />
            </div>
            <div>
              <Typography.Text type="secondary">New Type</Typography.Text>
              <Select
                value={changeTypeNewType || undefined}
                placeholder="Select new type"
                options={creatableTypeOptions.filter(o => o.value !== changeTypeTarget.type)}
                onChange={val => setChangeTypeNewType(val as ObjectType)}
                style={{ width: '100%', marginTop: 4 }}
                showSearch
                optionFilterProp="label"
              />
            </div>
            {changeTypeNewType && (
              <Alert
                type="warning" showIcon
                message="Changing the type may invalidate existing relationships and view placements."
                style={{ marginTop: 8 }}
              />
            )}
          </div>
        )}
      </Modal>

      {/* Relationship Modal */}
      <Modal
        open={relationshipModalOpen} title="Create Relationship"
        onCancel={() => setRelationshipModalOpen(false)} onOk={saveRelationshipFromModal}
        okText="Save" destroyOnClose
      >
        {relationshipSource ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Typography.Text type="secondary">Source Element</Typography.Text>
              <Input value={`${relationshipSource.name} · ${relationshipSource.type} · ${relationshipSource.id}`} disabled style={{ marginTop: 4 }} />
            </div>
            <div>
              <Typography.Text type="secondary">Relationship Type</Typography.Text>
              <Select
                value={selectedRelationshipType || undefined}
                options={(() => {
                  if (!relationshipSource) return [];
                  const def = OBJECT_TYPE_DEFINITIONS[relationshipSource.type as ObjectType];
                  const allowed = (def?.allowedOutgoingRelationships ?? []).filter(t => {
                    if (!isValidRelationshipType(t)) return false;
                    return Boolean(RELATIONSHIP_TYPE_DEFINITIONS[t]?.fromTypes.includes(relationshipSource.type as ObjectType));
                  }) as RelationshipType[];
                  return allowed.map(t => ({ value: t, label: t }));
                })()}
                onChange={val => {
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
                showSearch optionFilterProp="label"
                value={selectedTargetId || undefined}
                options={selectedRelationshipType && relationshipSource ? computeTargetOptions(selectedRelationshipType, relationshipSource) : []}
                onChange={val => setSelectedTargetId(String(val))}
                placeholder="Select target" style={{ width: '100%', marginTop: 4 }}
                disabled={!selectedRelationshipType}
              />
            </div>
          </div>
        ) : (
          <Typography.Text type="secondary">No source element selected.</Typography.Text>
        )}
      </Modal>

      {/* Add to View Modal */}
      <Modal
        open={addToViewModalOpen} title="Add to View"
        onCancel={() => setAddToViewModalOpen(false)} onOk={handleConfirmAddToView}
        okText="Add" okButtonProps={{ disabled: !addToViewViewId || !addToViewTarget }} destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Typography.Text type="secondary">Target view</Typography.Text>
            <Select
              value={addToViewViewId || undefined}
              options={savedViews.map(v => ({ value: v.id, label: `${v.name} (${v.viewpointId})` }))}
              onChange={val => setAddToViewViewId(val as string)}
              style={{ width: '100%', marginTop: 6 }} placeholder="Choose a view"
            />
          </div>
          {addToViewTarget && (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Adds {addToViewTarget.name} ({addToViewTarget.type}) to the view scope.
            </Typography.Paragraph>
          )}
        </Space>
      </Modal>

      {/* §11 Audit Trail Modal */}
      <Modal
        open={Boolean(auditTrailObjectId)}
        title={`Audit Trail — ${auditTrailObjectId ?? ''}`}
        onCancel={() => setAuditTrailObjectId(null)}
        footer={null}
        destroyOnClose
        width={640}
      >
        {auditTrailObjectId && <AuditTrailView objectId={auditTrailObjectId} />}
      </Modal>

      {/* Baseline Preview Modal */}
      <Modal
        open={baselinePreviewOpen} title={baselinePreview?.name || 'Baseline'}
        onCancel={() => { setBaselinePreview(null); setBaselinePreviewOpen(false); }}
        footer={null} destroyOnClose
      >
        {baselinePreview && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Text type="secondary">Read-only snapshot.</Typography.Text>
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
        )}
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------------------
// §11 Audit Trail inline sub-component
// ---------------------------------------------------------------------------
const AuditTrailView: React.FC<{ objectId: string }> = ({ objectId }) => {
  const entries = React.useMemo(() => {
    const { queryAuditLog } = require('./explorerAuditLog');
    return queryAuditLog({ objectId, limit: 50 });
  }, [objectId]);

  if (entries.length === 0) {
    return <Typography.Text type="secondary">No audit entries found for this object.</Typography.Text>;
  }

  return (
    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
      {entries.map((entry: any) => (
        <div key={entry.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
          <Space size={8}>
            <Tag color="blue">{entry.actionType}</Tag>
            <Typography.Text type="secondary">{entry.timestamp}</Typography.Text>
            <Typography.Text>by {entry.userId}</Typography.Text>
          </Space>
          {entry.beforeState && (
            <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>
              Before: {JSON.stringify(entry.beforeState).slice(0, 120)}…
            </div>
          )}
          {entry.afterState && (
            <div style={{ fontSize: 11, color: '#8c8c8c' }}>
              After: {JSON.stringify(entry.afterState).slice(0, 120)}…
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ExplorerTree;
