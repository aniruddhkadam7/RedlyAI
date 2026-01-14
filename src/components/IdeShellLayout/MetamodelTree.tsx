import {
  CaretDownOutlined,
  CaretRightOutlined,
  ProjectOutlined,
} from '@ant-design/icons';
import { Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import React from 'react';
import {
  EA_LAYERS,
  OBJECT_TYPE_DEFINITIONS,
  RELATIONSHIP_TYPE_DEFINITIONS,
  type EaLayer,
  type ObjectType,
  type RelationshipType,
} from '@/pages/dependency-view/utils/eaMetaModel';
import styles from './style.module.less';
import { useIdeSelection } from '@/ide/IdeSelectionContext';

const objectTypeNodesForLayer = (layer: EaLayer): DataNode[] => {
  const items = (Object.keys(OBJECT_TYPE_DEFINITIONS) as ObjectType[]).filter(
    (t) => OBJECT_TYPE_DEFINITIONS[t].layer === layer,
  );
  items.sort((a, b) => a.localeCompare(b));
  return items.map((type) => ({
    key: `metamodel:objectType:${type}`,
    title: type,
    isLeaf: true,
  }));
};

const relationshipTypeNodesForLayer = (layer: EaLayer): DataNode[] => {
  const items = (Object.keys(RELATIONSHIP_TYPE_DEFINITIONS) as RelationshipType[]).filter(
    (t) => RELATIONSHIP_TYPE_DEFINITIONS[t].layer === layer,
  );
  // Hide legacy/generic relationship types from the metamodel UI.
  const visible = items.filter((t) => t !== 'DEPENDS_ON');
  visible.sort((a, b) => a.localeCompare(b));
  return visible.map((type) => ({
    key: `metamodel:relationshipType:${type}`,
    title: type,
    isLeaf: true,
  }));
};

const MetamodelTree: React.FC = () => {
  const { setSelection } = useIdeSelection();

  const treeData = React.useMemo<DataNode[]>(() => {
    const layers: readonly EaLayer[] = EA_LAYERS;

    return [
      {
        key: 'metamodel',
        title: 'Metamodel',
        icon: <ProjectOutlined />,
        selectable: false,
        children: layers.map((layer) => {
          return {
            key: `metamodel:layer:${layer}`,
            title: layer,
            selectable: false,
            children: [
              {
                key: `metamodel:layer:${layer}:elementTypes`,
                title: 'Element Types',
                selectable: false,
                children: objectTypeNodesForLayer(layer),
              },
              {
                key: `metamodel:layer:${layer}:relationshipTypes`,
                title: 'Relationship Types',
                selectable: false,
                children: relationshipTypeNodesForLayer(layer),
              },
            ],
          } satisfies DataNode;
        }),
      },
    ];
  }, []);

  return (
    <div className={styles.explorerTree}>
      <Tree.DirectoryTree
        virtual={false}
        showIcon
        selectable
        blockNode
        expandAction={false}
        showLine={{ showLeafIcon: false }}
        treeData={treeData}
        defaultExpandedKeys={[
          'metamodel',
          'metamodel:layer:Business',
          'metamodel:layer:Business:elementTypes',
          'metamodel:layer:Business:relationshipTypes',
        ]}
        /* Intentionally keep visual selection empty (no blue highlight). */
        selectedKeys={[]}
        switcherIcon={({ expanded }) => (expanded ? <CaretDownOutlined /> : <CaretRightOutlined />)}
        onSelect={(selectedKeys: React.Key[], info) => {
          const key = selectedKeys?.[0];
          if (typeof key !== 'string') return;

          // Metamodel rule (IDE standard): caret/switcher click only expands/collapses.
          const target = (info?.nativeEvent?.target as HTMLElement | null) ?? null;
          if (target?.closest?.('.ant-tree-switcher')) return;

          setSelection({ kind: 'metamodel', keys: [key] });
        }}
      />
    </div>
  );
};

export default MetamodelTree;
