import {
  ApartmentOutlined,
  ArrowsAltOutlined,
  BuildOutlined,
  CaretDownOutlined,
  CaretUpOutlined,
  ClusterOutlined,
  DeploymentUnitOutlined,
  DoubleLeftOutlined,
  FolderOpenOutlined,
  FundOutlined,
  LineChartOutlined,
  NodeIndexOutlined,
  ProjectOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { ProCard } from '@ant-design/pro-components';
import { history, useLocation, useModel } from '@umijs/max';
import { Alert, Avatar, Button, Empty, Input, Layout, Modal, Tabs, Tooltip, Typography, message, theme } from 'antd';
import React from 'react';
import styles from './style.module.less';
import CatalogTableTab, { titleForCatalogKind, type CatalogKind } from './CatalogTableTab';
import ObjectTableTab from './ObjectTableTab';
import AnalysisTab, { type AnalysisKind } from './AnalysisTab';
import AnalysisResultTab from './AnalysisResultTab';
import ViewDefinitionTab from './ViewDefinitionTab';
import BaselineViewerTab from './BaselineViewerTab';
import PlateauViewerTab from './PlateauViewerTab';
import RoadmapViewerTab from './RoadmapViewerTab';
import ArchitectureAgentPanel from './ArchitectureAgentPanel';
import StudioShell from './StudioShell';
import { getBaselineById } from '../../../backend/baselines/BaselineStore';
import { getPlateauById } from '../../../backend/roadmap/PlateauStore';
import { getRoadmapById } from '../../../backend/roadmap/RoadmapStore';
import IdeMenuBar from '@/components/IdeMenuBar/IdeMenuBar';
import logoUrl from '../../../logo.png';
import aiLogoUrl from '../../../AI logo Foriday.webm';
import { getViewRepository } from '../../../backend/views/ViewRepositoryStore';
import { useIdeSelection } from '@/ide/IdeSelectionContext';
import { getAnalysisResult } from '@/analysis/analysisResultsStore';
import { IDE_COMMAND_EVENT, type IdeCommand } from '@/ide/ideCommands';
import { useEaProject } from '@/ea/EaProjectContext';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import { validateStrictGovernance } from '@/ea/strictGovernance';
import { isGapAnalysisAllowedForLifecycleCoverage, isRoadmapAllowedForLifecycleCoverage } from '@/repository/lifecycleCoveragePolicy';
import { ENABLE_RBAC, hasRepositoryPermission, type RepositoryRole } from '@/repository/accessControl';

type ActivityKey =
  | 'explorer'
  | 'diagrams'
  | 'analysis'
  | 'metamodel'
  | 'settings';

type TabItem = {
  key: string;
  label: string;
  kind: 'route' | 'workspace';
  content?: React.ReactNode;
};

type PanelDock = 'bottom' | 'right';

// Increased for legibility (logo + menu) per user request.
// NOTE: This intentionally exceeds VS Code's default header height.
const TOP_MENU_BAR_HEIGHT = 44;
const STATUS_BAR_HEIGHT = 22;

// VS Code-like defaults (not ultra-compact).
const ACTIVITY_BAR_WIDTH = 68;
const ACTIVITY_HIT_SIZE = 56;
const ACTIVITY_ICON_SIZE = 40;

// AI button is intentionally larger than other activity buttons.
const AI_HIT_SIZE = 62;
const AI_ICON_SIZE = 46;

const RIGHT_PANEL_MIN_WIDTH = 340;
const RIGHT_PANEL_MAX_WIDTH = 520;
const RIGHT_PANEL_DEFAULT_WIDTH = 420;

const LOGO_INSET = 2;
const LOGO_SIZE = TOP_MENU_BAR_HEIGHT - LOGO_INSET * 2;

type OpenWorkspaceTabArgs =
  | {
      type: 'catalog';
      catalog: CatalogKind;
    }
  | {
      type: 'object';
      objectId: string;
      objectType: string;
      name: string;
    }
  | {
      type: 'analysis';
      kind: AnalysisKind;
    }
  | {
      type: 'impact-element';
      elementId: string;
      elementName: string;
      elementType: string;
    }
  | {
      type: 'analysisResult';
      resultId: string;
    }
  | {
      type: 'view';
      viewId: string;
    }
  | {
      type: 'baseline';
      baselineId: string;
    }
  | {
      type: 'plateau';
      plateauId: string;
    }
  | {
      type: 'roadmap';
      roadmapId: string;
    };

type IdeShellApi = {
  openWorkspaceTab: (args: OpenWorkspaceTabArgs) => void;
  openRouteTab: (pathname: string) => void;
  openPropertiesPanel: (opts?: { elementId?: string; elementType?: string; dock?: PanelDock; readOnly?: boolean }) => void;
  hierarchyEditingEnabled: boolean;
};

const IdeShellContext = React.createContext<IdeShellApi | null>(null);

export const useIdeShell = () => {
  const ctx = React.useContext(IdeShellContext);
  if (!ctx) throw new Error('useIdeShell must be used within IdeShellLayout');
  return ctx;
};

const ACTIVITY_ITEMS: Array<{
  key: ActivityKey;
  title: string;
  icon: React.ReactNode;
}> = [
  { key: 'explorer', title: 'Explorer', icon: <FolderOpenOutlined /> },
  { key: 'diagrams', title: 'Diagrams', icon: <DeploymentUnitOutlined /> },
  { key: 'analysis', title: 'Analysis', icon: <FundOutlined /> },
  { key: 'metamodel', title: 'Metamodel', icon: <NodeIndexOutlined /> },
  { key: 'settings', title: 'Settings', icon: <SettingOutlined /> },
];

const ROUTE_TITLES: Record<string, string> = {
  '/applications': 'Applications',
  '/governance': 'Governance & Assurance',
  '/impact-analysis': 'Impact Analysis',
  '/diagrams/application-dependency': 'Application Dependency Views',
  '/diagrams/application-landscape': 'Application Landscape',
  '/diagrams/capability-map': 'Capability Map',
  '/diagrams/application-technology': 'Application Technology',
  '/diagrams/technology-landscape': 'Technology Landscape',
  '/views/create': 'Create View',
};

const titleForPath = (pathname: string) => {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  if (pathname === '/' || !pathname) return 'Home';
  const last = pathname.split('/').filter(Boolean).pop();
  if (!last) return 'Workspace';
  return last
    .split('-')
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(' ');
};

export type IdeShellLayoutProps = {
  sidebars?: Partial<Record<ActivityKey, React.ReactNode>>;
  /** When true, suppresses all non-shell content (no trees, no pages, no editors). */
  shellOnly?: boolean;
  children: React.ReactNode;
};

const PlaceholderPanel: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => {
  return (
    <div className={styles.placeholder}>
      <Typography.Text strong>{title}</Typography.Text>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        {subtitle ?? 'Placeholder panel (no business logic).'}
      </Typography.Paragraph>
    </div>
  );
};

const WorkspaceEmptyState: React.FC<{ title?: string; description?: string }> = ({
  title = 'No content',
  description = 'Open an item from the Explorer or navigate to a view.',
}) => {
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 24 }}>
      <Empty description={description}>
        <Typography.Text strong>{title}</Typography.Text>
      </Empty>
    </div>
  );
};

const IdeShellLayout: React.FC<IdeShellLayoutProps> = ({ sidebars, children, shellOnly = false }) => {
  const { token } = theme.useToken();
  const location = useLocation();
  const pathname = location.pathname || '/';
  const { initialState } = useModel('@@initialState');
  const { selection, setActiveDocument, setSelectedElement, setActiveElement, setActiveImpactElement } = useIdeSelection();
  const { project } = useEaProject();
  const { eaRepository, metadata } = useEaRepository();
  const userRole: RepositoryRole = React.useMemo(() => {
    if (!ENABLE_RBAC) return 'Owner';
    const access = initialState?.currentUser?.access;
    if (access === 'admin') return 'Owner';
    if (access === 'architect' || access === 'user') return 'Architect';
    return 'Viewer';
  }, [initialState?.currentUser?.access]);
  const currentUserLabel = React.useMemo(() => {
    const name = initialState?.currentUser?.name || initialState?.currentUser?.userid;
    return name && name.trim() ? name.trim() : 'Unknown user';
  }, [initialState?.currentUser?.name, initialState?.currentUser?.userid]);

  const cssVars = React.useMemo<React.CSSProperties>(
    () => ({
      ['--ide-bg-layout' as any]: token.colorBgLayout,
      ['--ide-bg-container' as any]: token.colorBgContainer,
      ['--ide-border' as any]: token.colorBorderSecondary,
      ['--ide-header-bg' as any]: token.colorBgElevated,
      ['--ide-rail-bg' as any]: token.colorFillTertiary,
      ['--ide-control-hover' as any]: token.colorFillSecondary,
      ['--ide-resizer-hover' as any]: token.colorFillSecondary,
      ['--ide-tab-inactive-bg' as any]: token.colorFillTertiary,
      // Explorer tree visuals must be neutral (no primary blue selection).
      // Use the text hover/active background tokens, which are designed to be subtle and neutral.
      ['--ide-tree-hover-bg' as any]: token.colorBgTextHover,
      ['--ide-tree-selected-bg' as any]: (token as any).colorBgTextActive ?? token.colorBgTextHover,
      ['--ide-tree-accent' as any]: token.colorBorderSecondary,
      ['--ide-tree-line' as any]: token.colorBorderSecondary,
      ['--ide-topbar-height' as any]: `${TOP_MENU_BAR_HEIGHT}px`,
      ['--ide-statusbar-height' as any]: `${STATUS_BAR_HEIGHT}px`,
    }),
    [token],
  );

  const [sidebarOpen, setSidebarOpen] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem('ide.sidebar.open') !== 'false';
    } catch {
      return true;
    }
  });

  const [sidebarWidth, setSidebarWidth] = React.useState<number>(() => {
    return 280;
  });

  const [bottomPanelOpen, setBottomPanelOpen] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem('ide.bottom.open') === 'true';
    } catch {
      return false;
    }
  });

  const [bottomPanelHeight, setBottomPanelHeight] = React.useState<number>(() => {
    try {
      const raw = Number(localStorage.getItem('ide.bottom.height'));
      if (Number.isFinite(raw) && raw >= 120 && raw <= 520) return raw;
      return 240;
    } catch {
      return 240;
    }
  });

  const [panelDock, setPanelDock] = React.useState<PanelDock>(() => {
    try {
      const raw = localStorage.getItem('ide.panel.dock');
      return raw === 'right' ? 'right' : 'bottom';
    } catch {
      return 'bottom';
    }
  });

  const [rightPanelWidth, setRightPanelWidth] = React.useState<number>(() => {
    try {
      const raw = Number(localStorage.getItem('ide.panel.right.width'));
      if (Number.isFinite(raw) && raw >= RIGHT_PANEL_MIN_WIDTH && raw <= RIGHT_PANEL_MAX_WIDTH) return raw;
      return RIGHT_PANEL_DEFAULT_WIDTH;
    } catch {
      return RIGHT_PANEL_DEFAULT_WIDTH;
    }
  });

  const [activity, setActivity] = React.useState<ActivityKey>(() => {
    try {
      const raw = localStorage.getItem('ide.activity');
      const valid = ACTIVITY_ITEMS.some((a) => a.key === raw);
      const next = (valid ? (raw as ActivityKey) : null) ?? 'explorer';
      // Metamodel is advanced: do not auto-open on app start.
      return next === 'metamodel' ? 'explorer' : next;
    } catch {
      return 'explorer';
    }
  });
  const [tabs, setTabs] = React.useState<TabItem[]>([]);
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [panelMode, setPanelMode] = React.useState<'properties' | 'agent'>('properties');
  const [studioMode, setStudioMode] = React.useState(false);
  const [studioEntryOpen, setStudioEntryOpen] = React.useState(false);
  const hierarchyEditingEnabled = React.useMemo(() => {
    if (!activeKey) return true;
    if (activeKey.startsWith('baseline:')) return false;
    if (activeKey.startsWith('plateau:')) return false;
    if (activeKey.startsWith('roadmap:')) return false;
    return true;
  }, [activeKey]);

  const fullscreenRestoreRef = React.useRef<
    | {
        sidebarOpen: boolean;
        bottomPanelOpen: boolean;
        panelDock: PanelDock;
      }
    | null
  >(null);

  React.useEffect(() => {
    // IDE rule: left panel selections / route changes must not replace the active editor
    // unless the current active editor is a route tab (or there are no tabs yet).
    setTabs((prev) => {
      // If there are no tabs, create an initial route tab so the shell isn't "tab-less" on first load.
      if (prev.length === 0) return [{ key: pathname, label: titleForPath(pathname), kind: 'route' }];

      // If the user is currently focused on a route tab, ensure the new route exists.
      if ((activeKey ?? '').startsWith('/')) {
        if (prev.some((t) => t.key === pathname)) return prev;
        return [...prev, { key: pathname, label: titleForPath(pathname), kind: 'route' }];
      }

      // If focused on a workspace tab, do not implicitly open tabs for route changes.
      return prev;
    });

    setActiveKey((prev) => {
      if (!prev) {
        // First load: activate the initial route tab.
        return pathname;
      }
      // Keep active route tab in sync with navigation, but never steal focus from workspace tabs.
      return prev.startsWith('/') ? pathname : prev;
    });
  }, [activeKey, pathname]);

  React.useEffect(() => {
    if (!activeKey) {
      setActiveDocument({ kind: 'workspace', key: '' });
      return;
    }

    const kind = activeKey.startsWith('/') ? 'route' : 'workspace';
    const key = kind === 'route' ? pathname : activeKey;
    setActiveDocument({ kind, key });
  }, [activeKey, pathname, setActiveDocument]);

  React.useEffect(() => {
    try {
      localStorage.setItem('ide.activity', activity);
    } catch {
      // Best-effort only.
    }
  }, [activity]);

  React.useEffect(() => {
    try {
      localStorage.setItem('ide.sidebar.open', sidebarOpen ? 'true' : 'false');
    } catch {
      // Best-effort only.
    }
  }, [sidebarOpen]);

  React.useEffect(() => {
    try {
      localStorage.setItem('ide.sidebar.width', String(sidebarWidth));
    } catch {
      // Best-effort only.
    }
  }, [sidebarWidth]);

  React.useEffect(() => {
    try {
      localStorage.setItem('ide.bottom.open', bottomPanelOpen ? 'true' : 'false');
    } catch {
      // Best-effort only.
    }
  }, [bottomPanelOpen]);

  React.useEffect(() => {
    try {
      localStorage.setItem('ide.bottom.height', String(bottomPanelHeight));
    } catch {
      // Best-effort only.
    }
  }, [bottomPanelHeight]);

  React.useEffect(() => {
    try {
      localStorage.setItem('ide.panel.dock', panelDock);
    } catch {
      // Best-effort only.
    }
  }, [panelDock]);

  React.useEffect(() => {
    try {
      localStorage.setItem('ide.panel.right.width', String(rightPanelWidth));
    } catch {
      // Best-effort only.
    }
  }, [rightPanelWidth]);

  React.useEffect(() => {
    if (!studioMode) return;
    if (panelMode !== 'properties') setPanelMode('properties');
  }, [panelMode, studioMode]);

  const openWorkspaceTab = React.useCallback((args: OpenWorkspaceTabArgs) => {
    if (args.type === 'catalog') {
      if (metadata?.architectureScope === 'Programme') {
        const allowed: ReadonlySet<string> = new Set([
          'programmes',
          'projects',
          'capabilities',
          'applications',
          // Hidden by default in Explorer, but can be enabled later.
          'technologies',
        ]);
        if (!allowed.has(args.catalog)) {
          message.warning(
            'Programme scope: only Programmes, Projects, impacted Capabilities, and impacted Applications catalogs are available.',
          );
          return;
        }
      }

      if (metadata?.architectureScope === 'Domain') {
        const allowed: ReadonlySet<string> = new Set([
          'capabilities',
          'businessServices',
          'applications',
          'applicationServices',
        ]);
        if (!allowed.has(args.catalog)) {
          message.warning(
            'Domain scope is focused: only Capabilities, Business Services, Applications, and Application Services catalogs are available.',
          );
          return;
        }
      }

      try {
        localStorage.setItem('ea.catalogDefined', 'true');
        window.dispatchEvent(new Event('ea:catalogDefined'));
      } catch {
        // Best-effort only.
      }

      const key = `catalog:${args.catalog}`;
      const label = titleForCatalogKind(args.catalog);
      const content = <CatalogTableTab kind={args.catalog} />;

      setTabs((prev) => {
        if (prev.some((t) => t.key === key)) return prev;
        return [...prev, { key, label, kind: 'workspace', content }];
      });
      setActiveKey(key);
      return;
    }

    if (args.type === 'object') {
      try {
        localStorage.setItem('ea.catalogDefined', 'true');
        window.dispatchEvent(new Event('ea:catalogDefined'));
      } catch {
        // Best-effort only.
      }

      const key = `object:${args.objectId}`;
      const label = args.name || args.objectId;
      const content = (
        <ObjectTableTab id={args.objectId} name={args.name || args.objectId} objectType={args.objectType} />
      );

      setTabs((prev) => {
        if (prev.some((t) => t.key === key)) return prev;
        return [...prev, { key, label, kind: 'workspace', content }];
      });
      setActiveKey(key);
      return;
    }

    if (args.type === 'analysis') {
      if (metadata?.architectureScope === 'Domain' && (args.kind === 'roadmap' || args.kind === 'gap')) {
        message.warning('Domain scope: Roadmap and Gap Analysis are hidden to keep the workspace focused.');
        return;
      }

      if (args.kind === 'roadmap' && !isRoadmapAllowedForLifecycleCoverage(metadata?.lifecycleCoverage)) {
        message.warning(
          "Lifecycle Coverage is 'As-Is': Roadmap is hidden. Change Lifecycle Coverage to 'To-Be' or 'Both' to use Roadmap.",
        );
        return;
      }

      if (args.kind === 'gap' && !isGapAnalysisAllowedForLifecycleCoverage(metadata?.lifecycleCoverage)) {
        message.warning(
          "Lifecycle Coverage is 'To-Be': Gap Analysis is disabled (no As-Is baseline). Change Lifecycle Coverage to 'As-Is' or 'Both' to run Gap Analysis.",
        );
        return;
      }

      const key = `analysis:${args.kind}`;
      const label =
        args.kind === 'impact'
          ? 'Impact Analysis'
          : args.kind === 'dependency'
            ? 'Dependency Analysis'
            : args.kind === 'roadmap'
              ? 'Roadmap'
              : 'Gap Analysis';
      const content = <AnalysisTab kind={args.kind} />;

      setTabs((prev) => {
        if (prev.some((t) => t.key === key)) return prev;
        return [...prev, { key, label, kind: 'workspace', content }];
      });
      setActiveKey(key);
      return;
    }

    if (args.type === 'impact-element') {
      const key = `impact-element:${args.elementId}`;
      const label = `Impact Analysis - ${args.elementName || args.elementId}`;
      setActiveImpactElement({ id: args.elementId, type: args.elementType });
      const content = (
        <div style={{ padding: 16 }}>
          <Typography.Title level={4} style={{ marginTop: 0 }}>
            Impact Analysis - {args.elementName || args.elementId}
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
            New tab placeholder (no diagrams, no properties panel). Hook up analysis UI here.
          </Typography.Paragraph>
        </div>
      );

      setTabs((prev) => {
        if (prev.some((t) => t.key === key)) return prev;
        return [...prev, { key, label, kind: 'workspace', content }];
      });
      setActiveKey(key);
      return;
    }

    if (args.type === 'analysisResult') {
      const key = `analysisResult:${args.resultId}`;
      const content = <AnalysisResultTab resultId={args.resultId} />;

      let label = 'Analysis Result';
      try {
        const rec = getAnalysisResult(args.resultId);
        if (rec?.title) label = rec.title;
      } catch {
        // Best-effort only.
      }

      setTabs((prev) => {
        if (prev.some((t) => t.key === key)) return prev;
        return [...prev, { key, label, kind: 'workspace', content }];
      });
      setActiveKey(key);
      return;
    }

    if (args.type === 'view') {
      const key = `view:${args.viewId}`;
      const content = <ViewDefinitionTab viewId={args.viewId} />;

      let label = 'View';
      try {
        const view = getViewRepository().getViewById(args.viewId);
        if (view?.name) label = view.name;
      } catch {
        // Best-effort only.
      }

      setTabs((prev) => {
        if (prev.some((t) => t.key === key)) return prev;
        return [...prev, { key, label, kind: 'workspace', content }];
      });
      setActiveKey(key);
      return;
    }

    if (args.type === 'baseline') {
      const key = `baseline:${args.baselineId}`;
      const content = <BaselineViewerTab baselineId={args.baselineId} />;
      let label = 'Baseline';
      try {
        const baseline = getBaselineById(args.baselineId);
        if (baseline?.name) label = baseline.name;
      } catch {
        // Best-effort only.
      }

      setTabs((prev) => {
        if (prev.some((t) => t.key === key)) return prev;
        return [...prev, { key, label, kind: 'workspace', content }];
      });
      setActiveKey(key);
      return;
    }

    if (args.type === 'plateau') {
      const key = `plateau:${args.plateauId}`;
      const content = <PlateauViewerTab plateauId={args.plateauId} />;
      let label = 'Plateau';
      try {
        const plateau = getPlateauById(args.plateauId);
        if (plateau?.name) label = plateau.name;
      } catch {
        // Best-effort only.
      }

      setTabs((prev) => {
        if (prev.some((t) => t.key === key)) return prev;
        return [...prev, { key, label, kind: 'workspace', content }];
      });
      setActiveKey(key);
      return;
    }

    if (args.type === 'roadmap') {
      const key = `roadmap:${args.roadmapId}`;
      const content = <RoadmapViewerTab roadmapId={args.roadmapId} />;
      let label = 'Roadmap';
      try {
        const roadmap = getRoadmapById(args.roadmapId);
        if (roadmap?.name) label = roadmap.name;
      } catch {
        // Best-effort only.
      }

      setTabs((prev) => {
        if (prev.some((t) => t.key === key)) return prev;
        return [...prev, { key, label, kind: 'workspace', content }];
      });
      setActiveKey(key);
      return;
    }
  }, [metadata?.architectureScope, metadata?.lifecycleCoverage]);

  React.useEffect(() => {
    // One-time startup behavior after creating a repository.
    try {
      const intent = localStorage.getItem('ea.startup.open.v1');
      if (!intent) return;
      if (!metadata || !project) return;

      const intentToCatalog: Partial<Record<string, CatalogKind>> = {
        'business.enterprises': 'enterprises',
        'business.capabilities': 'capabilities',
        'application.applications': 'applications',
        'implmig.programmes': 'programmes',
      };

      const catalog = intentToCatalog[intent];
      if (!catalog) return;

      // Consume intent before opening to prevent loops.
      localStorage.removeItem('ea.startup.open.v1');

      setActivity('explorer');
      openWorkspaceTab({ type: 'catalog', catalog });
      if (pathname !== '/workspace') history.push('/workspace');
    } catch {
      // Best-effort only.
    }
  }, [metadata, openWorkspaceTab, pathname, project]);

  const openRouteTab = React.useCallback(
    (path: string) => {
      const key = path || '/';
      setTabs((prev) => {
        if (prev.some((t) => t.key === key)) return prev;
        return [...prev, { key, label: titleForPath(key), kind: 'route' }];
      });
      setActiveKey(key);
      if (key.startsWith('/') && key !== pathname) history.push(key);
    },
    [pathname],
  );

  const [propertiesReadOnly, setPropertiesReadOnly] = React.useState(false);

  const openPropertiesPanel = React.useCallback(
    (opts?: { elementId?: string; elementType?: string; dock?: PanelDock; readOnly?: boolean }) => {
      const targetId = opts?.elementId ?? selection.selectedElementId ?? null;
      const targetType = opts?.elementType ?? selection.selectedElementType ?? null;
      if (targetId && targetType) {
        setSelectedElement({ id: targetId, type: targetType, source: opts?.dock ? 'Explorer' : selection.selectedSource ?? 'Explorer' });
      }
      setPanelMode('properties');
      setPanelDock(opts?.dock ?? 'right');
      setPropertiesReadOnly(Boolean(opts?.readOnly));
      setBottomPanelOpen(true);
    },
    [selection.selectedElementId, selection.selectedElementType, selection.selectedSource, setSelectedElement, setBottomPanelOpen, setPanelDock, setPanelMode, setPropertiesReadOnly],
  );

  const closeTab = React.useCallback(
    (targetKey: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.key !== targetKey);
        if (targetKey !== activeKey) return next;

        const fallback = next[next.length - 1];
        if (!fallback) {
          setActiveKey(null);
          return next;
        }

        setActiveKey(fallback.key);
        if (fallback.kind === 'route' && fallback.key !== pathname) history.push(fallback.key);
        return next;
      });
    },
    [activeKey, pathname],
  );

  const sidebarTitleText = ACTIVITY_ITEMS.find((a) => a.key === activity)?.title ?? 'Repository';
  const studioEntryDisabled = React.useMemo(() => {
    if (!activeKey) return false;
    return (
      activeKey.startsWith('baseline:') ||
      activeKey.startsWith('plateau:') ||
      activeKey.startsWith('roadmap:')
    );
  }, [activeKey]);
  const canEnterStudio = React.useCallback(() => {
    if (!eaRepository || !metadata) {
      message.warning('No repository loaded. Create or open a repository first.');
      return false;
    }

    if (studioEntryDisabled) {
      message.warning('Architecture Studio is unavailable in Baseline / Roadmap / Plateau context.');
      return false;
    }

    const canModel =
      hasRepositoryPermission(userRole, 'createElement') ||
      hasRepositoryPermission(userRole, 'editElement') ||
      hasRepositoryPermission(userRole, 'createRelationship') ||
      hasRepositoryPermission(userRole, 'editRelationship');

    if (!canModel) {
      message.error('Repository is read-only for your role. Modeling is not allowed.');
      return false;
    }

    const governanceCheck = validateStrictGovernance(eaRepository, {
      governanceMode: metadata.governanceMode,
      lifecycleCoverage: metadata.lifecycleCoverage,
    });

    if (!governanceCheck.ok) {
      Modal.error({
        title: 'Studio entry blocked by governance',
        content: (
          <div>
            <div>{governanceCheck.violation.message}</div>
            {governanceCheck.violation.highlights.length > 0 && (
              <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18 }}>
                {governanceCheck.violation.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            )}
          </div>
        ),
      });
      return false;
    }

    return true;
  }, [eaRepository, metadata, studioEntryDisabled, userRole]);
  const sidebarTitleNode: React.ReactNode =
    activity === 'metamodel' ? (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontStyle: 'italic' }}>{sidebarTitleText}</span>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          Advanced
        </Typography.Text>
      </span>
    ) : (
      sidebarTitleText
    );

  const activeSidebarKey: ActivityKey = ACTIVITY_ITEMS.some((i) => i.key === activity) ? activity : 'explorer';
  const explorerBody = sidebars?.explorer ?? <PlaceholderPanel title="Explorer" />;
  const diagramsBody = sidebars?.diagrams ?? <PlaceholderPanel title="Diagrams" />;
  const analysisBody = sidebars?.analysis ?? <PlaceholderPanel title="Analysis" />;
  const metamodelBody = sidebars?.metamodel ?? <PlaceholderPanel title="Metamodel" />;
  const settingsBody = sidebars?.settings ?? <PlaceholderPanel title="Settings" />;

  const sidebarBody = (
    <>
      <div
        style={{ display: activeSidebarKey === 'explorer' ? 'block' : 'none' }}
      >
        {explorerBody}
      </div>
      <div
        style={{ display: activeSidebarKey === 'diagrams' ? 'block' : 'none' }}
      >
        {diagramsBody}
      </div>
      <div
        style={{ display: activeSidebarKey === 'analysis' ? 'block' : 'none' }}
      >
        {analysisBody}
      </div>
      <div
        style={{ display: activeSidebarKey === 'metamodel' ? 'block' : 'none' }}
      >
        {metamodelBody}
      </div>
      <div
        style={{ display: activeSidebarKey === 'settings' ? 'block' : 'none' }}
      >
        {settingsBody}
      </div>
    </>
  );

  const statusLeftText = project?.name
    ? `Project: ${project.name}${metadata?.repositoryName ? ` • Repository: ${metadata.repositoryName}` : ''}`
    : metadata?.repositoryName
      ? `Repository: ${metadata.repositoryName}`
      : 'No project/repository loaded';

  const resetLayout = React.useCallback(() => {
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.startsWith('ide.')) localStorage.removeItem(k);
      }
    } catch {
      // Best-effort.
    }

    setSidebarOpen(true);
    setActivity('explorer');
    setSidebarWidth(280);
    setBottomPanelOpen(false);
    setBottomPanelHeight(240);
    setPanelDock('bottom');
    setRightPanelWidth(RIGHT_PANEL_DEFAULT_WIDTH);
  }, []);

  const closeMatchingTabs = React.useCallback(
    (prefix: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => !t.key.startsWith(prefix));
        return next;
      });
      setActiveKey((prev) => {
        if (!prev) return prev;
        if (!prev.startsWith(prefix)) return prev;
        // Fallback to current route tab.
        return pathname;
      });
    },
    [pathname],
  );

  const resetTabs = React.useCallback(() => {
    setTabs([{ key: pathname, label: titleForPath(pathname), kind: 'route' }]);
    setActiveKey(pathname);
  }, [pathname]);

  React.useEffect(() => {
    const onCommand = (ev: Event) => {
      const e = ev as CustomEvent<IdeCommand>;
      const cmd = e.detail;
      if (!cmd) return;

      if (cmd.type === 'view.toggleSidebar') {
        setSidebarOpen((v) => !v);
        return;
      }

      if (cmd.type === 'view.showActivity') {
        setActivity(cmd.activity as ActivityKey);
        setSidebarOpen(true);
        return;
      }

      if (cmd.type === 'view.toggleBottomPanel') {
        setBottomPanelOpen((v) => !v);
        return;
      }

      if (cmd.type === 'view.resetLayout') {
        resetLayout();
        return;
      }

      if (cmd.type === 'view.fullscreen.toggle') {
        const doc = document as any;
        const isFs = Boolean(doc.fullscreenElement);

        if (!isFs) {
          fullscreenRestoreRef.current = { sidebarOpen, bottomPanelOpen, panelDock };
          setSidebarOpen(false);
          setBottomPanelOpen(false);
          try {
            void (document.documentElement as any).requestFullscreen?.();
          } catch {
            // ignore
          }
          return;
        }

        try {
          void doc.exitFullscreen?.();
        } catch {
          // ignore
        }
        const restore = fullscreenRestoreRef.current;
        if (restore) {
          setSidebarOpen(restore.sidebarOpen);
          setBottomPanelOpen(restore.bottomPanelOpen);
          setPanelDock(restore.panelDock);
        }
        fullscreenRestoreRef.current = null;
        return;
      }

      if (cmd.type === 'navigation.openRoute') {
        openRouteTab(cmd.path);
        return;
      }

      if (cmd.type === 'navigation.openWorkspace') {
        openWorkspaceTab(cmd.args);
        return;
      }

      if (cmd.type === 'workspace.closeMatchingTabs') {
        closeMatchingTabs(cmd.prefix);
        return;
      }

      if (cmd.type === 'workspace.resetTabs') {
        resetTabs();
        return;
      }
    };

    window.addEventListener(IDE_COMMAND_EVENT, onCommand as EventListener);
    return () => window.removeEventListener(IDE_COMMAND_EVENT, onCommand as EventListener);
  }, [bottomPanelOpen, closeMatchingTabs, openRouteTab, openWorkspaceTab, panelDock, resetLayout, resetTabs, sidebarOpen]);

  const beginSidebarResize: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const next = Math.max(220, Math.min(520, startWidth + delta));
      setSidebarWidth(next);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const beginBottomResize: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = bottomPanelHeight;

    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      const next = Math.max(120, Math.min(520, startHeight + delta));
      setBottomPanelHeight(next);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const beginRightResize: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightPanelWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      const next = Math.max(RIGHT_PANEL_MIN_WIDTH, Math.min(RIGHT_PANEL_MAX_WIDTH, startWidth + delta));
      setRightPanelWidth(next);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const ctxValue = React.useMemo<IdeShellApi>(
    () => ({ openWorkspaceTab, openRouteTab, openPropertiesPanel, hierarchyEditingEnabled }),
    [hierarchyEditingEnabled, openWorkspaceTab, openRouteTab, openPropertiesPanel],
  );

  const activeElementId = selection.selectedElementId;
  const activeElementType = selection.selectedElementType;
  const activeElement = React.useMemo(() => {
    if (!activeElementId || !eaRepository) return null;
    return eaRepository.objects.get(activeElementId) ?? null;
  }, [activeElementId, eaRepository]);

  const activeElementName = React.useMemo(() => {
    const raw = (activeElement?.attributes as any)?.name;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    return activeElement?.id ?? activeElementId ?? '';
  }, [activeElement?.attributes, activeElement?.id, activeElementId]);

  const renderPanelBody = React.useCallback(() => {
    if (panelMode === 'properties') {
      if (!activeElementId || !activeElementType) {
        return (
          <div className={styles.bottomPanelBody}>
            <WorkspaceEmptyState
              title="No element selected"
              description="Select an element, then choose Open Properties."
            />
          </div>
        );
      }
      return (
        <div className={styles.bottomPanelBody}>
          <ObjectTableTab
            id={activeElementId}
            name={activeElementName || activeElementId}
            objectType={activeElementType}
            readOnly={propertiesReadOnly}
          />
        </div>
      );
    }

    return (
      <div className={styles.bottomPanelBody}>
        <ArchitectureAgentPanel />
      </div>
    );
  }, [activeElementId, activeElementName, activeElementType, panelMode, propertiesReadOnly]);

  const exitStudioMode = React.useCallback(() => {
    setStudioMode(false);
    try {
      window.dispatchEvent(new Event('ea:repositoryChanged'));
      window.dispatchEvent(new Event('ea:relationshipsChanged'));
      window.dispatchEvent(new Event('ea:viewsChanged'));
    } catch {
      // Best-effort only.
    }
  }, []);

  return (
    <div className={styles.root} style={cssVars}>
      <IdeShellContext.Provider value={ctxValue}>
        <Layout className={styles.layoutRoot} style={{ background: token.colorBgLayout }}>
          <Layout.Header
            className={styles.topHeader}
            style={{
              height: TOP_MENU_BAR_HEIGHT,
              lineHeight: `${TOP_MENU_BAR_HEIGHT}px`,
              paddingInline: 0,
              paddingBlock: 0,
              background: token.colorBgElevated,
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
              display: 'flex',
              alignItems: 'center',
              minHeight: TOP_MENU_BAR_HEIGHT,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', height: '100%', width: '100%', minWidth: 0 }}>
              <div
                style={{
                  width: ACTIVITY_BAR_WIDTH,
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRight: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                <Tooltip title="Home" placement="bottom">
                  <Button
                    type="text"
                    className={styles.logoButton}
                    aria-label="Go to Home"
                    onClick={() => openRouteTab('/')}
                    style={{
                      width: LOGO_SIZE,
                      height: LOGO_SIZE,
                      padding: 0,
                      borderRadius: 8,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Avatar
                      className={styles.headerLogo}
                      shape="square"
                      src={logoUrl}
                      alt="Logo"
                      size={LOGO_SIZE}
                      style={{
                        background: 'transparent',
                        borderRadius: 6,
                      }}
                    />
                  </Button>
                </Tooltip>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflow: 'hidden',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  alignItems: 'center',
                  width: '100%',
                }}
              >
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <IdeMenuBar />
                </div>
                <div style={{ paddingInline: 8, display: 'flex', justifyContent: 'center' }}>
                  <Input.Search
                    placeholder="Search"
                    allowClear
                    size="middle"
                    className={styles.headerSearch}
                    style={{ width: 400 }}
                  />
                </div>
                <div style={{ paddingInline: 10, display: 'flex', justifyContent: 'flex-end', gap: 5 }}>
                  <Typography.Text type="secondary" style={{ fontWeight: 500 }}>
                    User: {currentUserLabel}
                  </Typography.Text>
                </div>
              </div>
            </div>
          </Layout.Header>

          <Layout className={styles.mainRow} style={{ background: token.colorBgLayout }}>
            <Layout.Sider
              className={styles.activitySider}
              width={ACTIVITY_BAR_WIDTH}
              collapsedWidth={ACTIVITY_BAR_WIDTH}
              theme="light"
              trigger={null}
              collapsible={false}
              style={{
                background: token.colorBgElevated,
                borderRight: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <div
                style={{
                  height: '100%',
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  paddingBlock: token.paddingXXS,
                  gap: 9,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
                  <Tooltip
                    title={studioEntryDisabled ? 'Architecture Studio unavailable in Baseline / Roadmap / Plateau.' : 'Architecture Studio'}
                    placement="right"
                  >
                    <Button
                      type="text"
                      className={styles.activityButton}
                      aria-label="Architecture Studio"
                      disabled={studioEntryDisabled}
                      onClick={() => {
                        if (!canEnterStudio()) return;
                        setStudioEntryOpen(true);
                      }}
                      style={{
                        width: ACTIVITY_HIT_SIZE,
                        height: ACTIVITY_HIT_SIZE,
                        minWidth: ACTIVITY_HIT_SIZE,
                        color: studioMode ? token.colorWarning : token.colorTextSecondary,
                        border: studioMode ? `1px solid ${token.colorWarning}` : '1px solid transparent',
                      }}
                      icon={<BuildOutlined style={{ fontSize: ACTIVITY_ICON_SIZE }} />}
                    />
                  </Tooltip>
                  {ACTIVITY_ITEMS.filter((i) => i.key !== 'settings').map((item) => {
                    const selected = item.key === activity;
                    return (
                      <Tooltip key={item.key} title={item.title} placement="right">
                        <Button
                          type="text"
                          className={selected ? styles.activityButtonActive : styles.activityButton}
                          onClick={() => {
                            if (selected) {
                              setSidebarOpen((v) => !v);
                              return;
                            }
                            setActivity(item.key);
                            setSidebarOpen(true);
                          }}
                          aria-label={item.title}
                          style={
                            selected
                              ? {
                                  width: ACTIVITY_HIT_SIZE,
                                  height: ACTIVITY_HIT_SIZE,
                                  minWidth: ACTIVITY_HIT_SIZE,
                                  background: token.colorBgTextHover,
                                  color: token.colorText,
                                  border: `1px solid ${token.colorBorderSecondary}`,
                                }
                              : {
                                  width: ACTIVITY_HIT_SIZE,
                                  height: ACTIVITY_HIT_SIZE,
                                  minWidth: ACTIVITY_HIT_SIZE,
                                  color: token.colorTextSecondary,
                                  border: '1px solid transparent',
                                }
                          }
                          icon={React.cloneElement(item.icon as any, { style: { fontSize: ACTIVITY_ICON_SIZE } })}
                        />
                      </Tooltip>
                    );
                  })}
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
                  <Tooltip title="AI" placement="right">
                    <Button
                      type="text"
                      className={styles.aiButton}
                      aria-label="Toggle AI panel"
                      onClick={() => {
                            setPanelMode('agent');
                        setBottomPanelOpen((wasOpen) => (panelDock === 'right' ? !wasOpen : true));
                        setPanelDock('right');
                      }}
                      style={{
                        width: AI_HIT_SIZE,
                        height: AI_HIT_SIZE,
                        minWidth: AI_HIT_SIZE,
                        padding: 0,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        background: token.colorBgTextHover,
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <video
                        src={aiLogoUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="auto"
                        style={{
                          width: AI_ICON_SIZE,
                          height: AI_ICON_SIZE,
                          objectFit: 'cover',
                          display: 'block',
                          pointerEvents: 'none',
                          borderRadius: 12,
                        }}
                      />
                    </Button>
                  </Tooltip>

                  <Tooltip title="Profile" placement="right">
                    <Button
                      type="text"
                      aria-label="Profile"
                      style={{
                        width: ACTIVITY_HIT_SIZE,
                        height: ACTIVITY_HIT_SIZE,
                        minWidth: ACTIVITY_HIT_SIZE,
                        padding: 0,
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <Avatar size={28} icon={<UserOutlined style={{ fontSize: 18 }} />} />
                    </Button>
                  </Tooltip>

                  {(() => {
                    const selected = activity === 'settings';
                    return (
                      <Tooltip title="Settings" placement="right">
                        <Button
                          type="text"
                          className={selected ? styles.activityButtonActive : styles.activityButton}
                          onClick={() => {
                            if (selected) {
                              setSidebarOpen((v) => !v);
                              return;
                            }
                            setActivity('settings');
                            setSidebarOpen(true);
                          }}
                          aria-label="Settings"
                          style={
                            selected
                              ? {
                                  width: ACTIVITY_HIT_SIZE,
                                  height: ACTIVITY_HIT_SIZE,
                                  minWidth: ACTIVITY_HIT_SIZE,
                                  background: token.colorBgTextHover,
                                  color: token.colorText,
                                  border: `1px solid ${token.colorBorderSecondary}`,
                                }
                              : {
                                  width: ACTIVITY_HIT_SIZE,
                                  height: ACTIVITY_HIT_SIZE,
                                  minWidth: ACTIVITY_HIT_SIZE,
                                  color: token.colorTextSecondary,
                                  border: '1px solid transparent',
                                }
                          }
                          icon={<SettingOutlined style={{ fontSize: ACTIVITY_ICON_SIZE }} />}
                        />
                      </Tooltip>
                    );
                  })()}
                </div>
              </div>
            </Layout.Sider>

            <Layout.Sider
              className={styles.sidebarSider}
              collapsed={!sidebarOpen}
              collapsedWidth={0}
              width={sidebarWidth}
              theme="light"
              trigger={null}
              collapsible={false}
              style={{
                background: token.colorBgContainer,
                borderRight: `1px solid ${token.colorBorderSecondary}`,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
              }}
            >
              <div
                style={{
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  paddingInline: token.paddingSM,
                  background: token.colorBgElevated,
                  borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                <Typography.Text className={styles.sidebarHeaderText}>{sidebarTitleNode}</Typography.Text>
                <div style={{ marginLeft: 'auto' }}>
                  <Button
                    type="text"
                    size="small"
                    aria-label="Collapse side panel"
                    onClick={() => setSidebarOpen(false)}
                    icon={<DoubleLeftOutlined />}
                    style={{ color: token.colorTextSecondary }}
                  />
                </div>
              </div>
              <div className={styles.sidebarBody}>{sidebarBody}</div>
            </Layout.Sider>

            <div
              className={styles.leftDockResizer}
              role="separator"
              aria-label="Resize explorer panel"
              onMouseDown={beginSidebarResize}
              style={{ background: token.colorBgLayout }}
            />

            <Layout.Content
              className={styles.editorColumn}
              style={{ background: token.colorBgContainer, borderLeft: `1px solid ${token.colorBorderSecondary}` }}
            >

              <div className={styles.editorRow} style={{ background: token.colorBgContainer }}>
                <div className={styles.editorArea} style={{ background: token.colorBgContainer }}>
                  {studioMode ? (
                    <StudioShell propertiesPanel={renderPanelBody()} onExit={exitStudioMode} />
                  ) : (
                    <>
                      <Tabs
                        className={styles.editorTabs}
                        type="editable-card"
                        hideAdd
                        size="middle"
                        activeKey={activeKey ?? undefined}
                        items={tabs.map((t) => ({
                          key: t.key,
                          label: t.label,
                          closable: true,
                          children: (
                            <div className={styles.editorPane}>
                              <ProCard
                                className={styles.editorCanvas}
                                bordered
                                bodyStyle={{ height: '100%', padding: 16, overflow: 'auto' }}
                                style={{ height: '100%' }}
                              >
                                {(() => {
                                  if (shellOnly) {
                                    return (
                                      <WorkspaceEmptyState
                                        title="Shell mode"
                                        description="Shell-only rendering is enabled (no pages, no trees, no editors)."
                                      />
                                    );
                                  }

                                  const activeWorkspace = t.kind === 'workspace' && t.key === activeKey ? t.content : null;
                                  const activeRoute = t.kind === 'route' && t.key === pathname ? children : null;

                                  return activeWorkspace ?? activeRoute ?? <WorkspaceEmptyState />;
                                })()}
                              </ProCard>
                            </div>
                          ),
                        }))}
                        onChange={(key: string) => {
                          setActiveKey(key);
                          if (key.startsWith('/') && key !== pathname) history.push(key);
                        }}
                        onEdit={(targetKey: string | React.MouseEvent | React.KeyboardEvent, action: 'add' | 'remove') => {
                          if (action !== 'remove') return;
                          if (typeof targetKey !== 'string') return;
                          closeTab(targetKey);
                        }}
                      />

                      {tabs.length === 0 && <div className={styles.emptyEditor} />}
                    </>
                  )}
                </div>

                {!studioMode && panelDock === 'right' && bottomPanelOpen && (
                <>
                  <div
                    className={styles.rightResizer}
                    role="separator"
                    aria-label="Resize right panel"
                    onMouseDown={beginRightResize}
                    style={{ background: token.colorBgLayout }}
                  />
                    <div
                      className={styles.rightPanel}
                      style={{
                        width: rightPanelWidth,
                        background: token.colorBgElevated,
                        borderLeft: `1px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      <div className={styles.bottomPanelHeader}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <Typography.Text className={styles.bottomPanelTitle} type="secondary">
                            {panelMode === 'properties' ? 'Properties' : 'Architecture Agent'}
                          </Typography.Text>
                          {panelMode === 'properties' && (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {activeElementId
                                ? `${activeElementName}${activeElementType ? ` • ${activeElementType}` : ''}`
                                : 'No element selected'}
                            </Typography.Text>
                          )}
                        </div>
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Tooltip title="Dock bottom">
                            <button
                              type="button"
                              className={styles.iconButton}
                              aria-label="Dock panel to bottom"
                              onClick={() => setPanelDock('bottom')}
                              style={{ color: token.colorTextSecondary }}
                            >
                              <ArrowsAltOutlined />
                            </button>
                          </Tooltip>
                          <button
                            type="button"
                            className={styles.iconButton}
                            aria-label="Collapse panel"
                            onClick={() => setBottomPanelOpen(false)}
                            style={{ color: token.colorTextSecondary }}
                          >
                            <CaretDownOutlined />
                          </button>
                        </div>
                      </div>
                      {renderPanelBody()}
                  </div>
                </>
              )}

              {!studioMode && panelDock === 'right' && !bottomPanelOpen && (
                <div className={styles.rightCollapsedBar}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={panelMode === 'properties' ? 'Expand properties panel' : 'Expand architecture agent panel'}
                    onClick={() => setBottomPanelOpen(true)}
                    style={{ color: token.colorTextSecondary }}
                  >
                    <CaretUpOutlined />
                  </button>
                </div>
              )}
            </div>

            {!studioMode && panelDock === 'bottom' && bottomPanelOpen && (
              <>
                <div
                  className={styles.bottomResizer}
                  role="separator"
                  aria-label="Resize bottom panel"
                  onMouseDown={beginBottomResize}
                  style={{ background: token.colorBgLayout }}
                />
                <div
                  className={styles.bottomPanel}
                  style={{
                    height: bottomPanelHeight,
                    background: token.colorBgContainer,
                    borderTop: `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  <div className={styles.bottomPanelHeader}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Typography.Text className={styles.bottomPanelTitle} type="secondary">
                        {panelMode === 'properties' ? 'Properties' : 'Architecture Agent'}
                      </Typography.Text>
                      {panelMode === 'properties' && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {activeElementId
                            ? `${activeElementName}${activeElementType ? ` • ${activeElementType}` : ''}`
                            : 'No element selected'}
                        </Typography.Text>
                      )}
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Tooltip title="Dock right">
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label="Dock panel to right"
                          onClick={() => setPanelDock('right')}
                          style={{ color: token.colorTextSecondary }}
                        >
                          <ArrowsAltOutlined />
                        </button>
                      </Tooltip>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label="Collapse panel"
                        onClick={() => setBottomPanelOpen(false)}
                        style={{ color: token.colorTextSecondary }}
                      >
                        <CaretDownOutlined />
                      </button>
                    </div>
                  </div>
                  {renderPanelBody()}
                </div>
              </>
            )}

            {!studioMode && panelDock === 'bottom' && !bottomPanelOpen && (
              <div className={styles.bottomCollapsedBar}>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={panelMode === 'properties' ? 'Expand properties panel' : 'Expand architecture agent panel'}
                  onClick={() => setBottomPanelOpen(true)}
                  style={{ color: token.colorTextSecondary }}
                >
                  <CaretUpOutlined />
                </button>
              </div>
            )}
            </Layout.Content>
          </Layout>

          <Layout.Footer
            style={{
              height: STATUS_BAR_HEIGHT,
              lineHeight: `${STATUS_BAR_HEIGHT}px`,
              paddingInline: token.paddingSM,
              paddingBlock: 0,
              background: token.colorBgElevated,
              borderTop: `1px solid ${token.colorBorderSecondary}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              overflow: 'hidden',
            }}
          >
            <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {statusLeftText}
            </Typography.Text>

            <div style={{ display: 'flex', alignItems: 'center', gap: token.marginXXS }}>
              {studioMode && (
                <Typography.Text type="warning" style={{ fontSize: 12 }}>
                  Studio Mode: ON
                </Typography.Text>
              )}
              <Button
                type="text"
                size="small"
                icon={<SettingOutlined />}
                onClick={() => {
                  setActivity('settings');
                  setSidebarOpen(true);
                }}
              />
            </div>
          </Layout.Footer>
        </Layout>
        <Modal
          open={studioEntryOpen}
          title="Enter Architecture Studio"
          okText="Enter Studio"
          cancelText="Cancel"
          onCancel={() => setStudioEntryOpen(false)}
          onOk={() => {
            setStudioEntryOpen(false);
            setStudioMode(true);
            setPanelMode('properties');
            setPropertiesReadOnly(false);
            message.warning('Architecture Studio enabled. Changes here modify architecture model.');
          }}
        >
          <Alert
            type="warning"
            showIcon
            message="Changes here modify architecture model"
            style={{ marginBottom: 12 }}
          />
          <Typography.Paragraph style={{ marginBottom: 8 }}>
            Studio mode is opt-in. You are entering a powerful mode intended for explicit, confirmed modeling actions.
          </Typography.Paragraph>
          <Typography.Text strong>Non-negotiable rules:</Typography.Text>
          <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18 }}>
            <li>No element is created implicitly</li>
            <li>No relationship is inferred</li>
            <li>Every model change requires explicit confirmation</li>
            <li>Diagram never mutates model silently</li>
            <li>Properties panel remains authoritative</li>
          </ul>
        </Modal>
      </IdeShellContext.Provider>
    </div>
  );
};

export default IdeShellLayout;
