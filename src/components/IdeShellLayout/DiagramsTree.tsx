import {
  ApartmentOutlined,
  AppstoreOutlined,
  BranchesOutlined,
  CloudOutlined,
  FileAddOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { Tree, message } from 'antd';
import type { DataNode } from 'antd/es/tree';
import React from 'react';
import { useIdeShell } from './index';
import styles from './style.module.less';
import { useIdeSelection } from '@/ide/IdeSelectionContext';
import { useEaRepository } from '@/ea/EaRepositoryContext';

import type { ViewDefinition, ViewType } from '../../../backend/views/ViewDefinition';
import { getViewRepository } from '../../../backend/views/ViewRepositoryStore';

const VIEW_TYPE_LABELS: Record<ViewType, string> = {
  ApplicationDependency: 'Application Dependency',
  ApplicationLandscape: 'Application Landscape',
  CapabilityMap: 'Capability Map',
  TechnologyLandscape: 'Technology Landscape',
  ImpactView: 'Impact View',
};

const iconForViewType = (type: ViewType) => {
  switch (type) {
    case 'ApplicationDependency':
    case 'ApplicationLandscape':
      return <AppstoreOutlined />;
    case 'CapabilityMap':
      return <BranchesOutlined />;
    case 'TechnologyLandscape':
      return <CloudOutlined />;
    case 'ImpactView':
      return <ApartmentOutlined />;
    default:
      return <FileTextOutlined />;
  }
};

const buildTree = (
  views: ViewDefinition[],
  architectureScope: string | null | undefined,
  opts?: { showCreate?: boolean },
): DataNode[] => {
  const filtered =
    architectureScope === 'Programme' ? views.filter((v) => v.viewType === 'ImpactView') : views;

  const byType = new Map<ViewType, ViewDefinition[]>();

  for (const v of filtered) {
    const list = byType.get(v.viewType);
    if (list) list.push(v);
    else byType.set(v.viewType, [v]);
  }

  const typeNodes: DataNode[] = Array.from(byType.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([viewType, list]) => {
      list.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      return {
        key: `viewType:${viewType}`,
        title: VIEW_TYPE_LABELS[viewType] ?? viewType,
        icon: iconForViewType(viewType),
        selectable: false,
        children: list.map((v) => ({
          key: `view:${v.id}`,
          title: v.name,
          icon: <FileTextOutlined />,
          isLeaf: true,
        })),
      } satisfies DataNode;
    });

  const children: DataNode[] = [
    ...(opts?.showCreate === false
      ? []
      : [
          {
            key: '/views/create',
            title: 'Create View…',
            icon: <FileAddOutlined />,
            isLeaf: true,
          } satisfies DataNode,
        ]),
    ...typeNodes,
  ];

  if (typeNodes.length === 0) {
    children.push({
      key: 'views:empty',
      title: 'No saved views',
      selectable: false,
      icon: <FileTextOutlined />,
      isLeaf: true,
    });
  }

  return [
    {
      key: 'diagrams',
      title: 'Diagrams',
      icon: <ApartmentOutlined />,
      selectable: false,
      children,
    },
  ];
};

const DiagramsTree: React.FC = () => {
  const { openRouteTab, openWorkspaceTab, studioMode } = useIdeShell();
  const { setSelection } = useIdeSelection();
  const { metadata } = useEaRepository();

  const [treeData, setTreeData] = React.useState<DataNode[]>(() => {
    try {
      const views = getViewRepository().listAllViews();
      return buildTree(views, metadata?.architectureScope ?? null, { showCreate: !studioMode });
    } catch {
      return buildTree([], metadata?.architectureScope ?? null, { showCreate: !studioMode });
    }
  });

  React.useEffect(() => {
    const refresh = () => {
      try {
        setTreeData(buildTree(getViewRepository().listAllViews(), metadata?.architectureScope ?? null, { showCreate: !studioMode }));
      } catch {
        setTreeData(buildTree([], metadata?.architectureScope ?? null, { showCreate: !studioMode }));
      }
    };

    refresh();
    window.addEventListener('ea:viewsChanged', refresh);
    return () => window.removeEventListener('ea:viewsChanged', refresh);
  }, [metadata?.architectureScope, studioMode]);

  return (
    <div className={styles.explorerTree}>
      <Tree
        showIcon
        defaultExpandAll
        selectable
        treeData={treeData}
        onSelect={(selectedKeys: React.Key[]) => {
          const key = selectedKeys?.[0];
          if (typeof key !== 'string') return;

          if (key === '/views/create') {
            if (studioMode) {
              message.info('Create View is available in Studio via the + Add View button.');
              return;
            }
            setSelection({ kind: 'route', keys: [key] });
            openRouteTab(key);
            return;
          }

          if (key.startsWith('view:')) {
            const viewId = key.slice('view:'.length);
            if (!viewId) return;
            setSelection({ kind: 'view', keys: [viewId] });
            openWorkspaceTab({ type: 'view', viewId });
          }
        }}
      />
    </div>
  );
};

export default DiagramsTree;
