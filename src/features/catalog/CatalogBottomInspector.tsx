import { Button, Select, Typography } from 'antd';
import React from 'react';
import type { ViewInstance } from '@/diagram-studio/viewpoints/ViewInstance';
import type { EaRelationship } from '@/pages/dependency-view/utils/eaRepository';
import styles from './catalog.module.less';
import type { CatalogElement } from './types/catalog.types';

type InspectorTab = 'details' | 'relationships' | 'views';

type CatalogBottomInspectorProps = {
  element: CatalogElement | null;
  tab: InspectorTab;
  onTabChange: (next: InspectorTab) => void;
  onClose: () => void;
  relationships: EaRelationship[];
  views: ViewInstance[];
};

const CatalogBottomInspector: React.FC<CatalogBottomInspectorProps> = ({
  element,
  tab,
  onTabChange,
  onClose,
  relationships,
  views,
}) => {
  if (!element) return null;

  return (
    <div className={styles.registryInspector}>
      <div className={styles.inspectorHeader}>
        <Typography.Text strong>{element.name}</Typography.Text>
        <Select
          size="small"
          value={tab}
          onChange={(value) => onTabChange(value as InspectorTab)}
          options={[
            { value: 'details', label: 'Details' },
            { value: 'relationships', label: 'Relationships' },
            { value: 'views', label: 'Views' },
          ]}
        />
        <Button size="small" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className={styles.inspectorBody}>
        {tab === 'details' ? (
          <div className={styles.detailGrid}>
            <div>
              <Typography.Text type="secondary">Type</Typography.Text>
              <div>{element.elementType}</div>
            </div>
            <div>
              <Typography.Text type="secondary">Owner</Typography.Text>
              <div>{element.owner || '-'}</div>
            </div>
            <div>
              <Typography.Text type="secondary">Lifecycle</Typography.Text>
              <div>{element.lifecycle || '-'}</div>
            </div>
            <div>
              <Typography.Text type="secondary">Status</Typography.Text>
              <div>{element.status || '-'}</div>
            </div>
            <div>
              <Typography.Text type="secondary">Criticality</Typography.Text>
              <div>{element.criticality || '-'}</div>
            </div>
            <div>
              <Typography.Text type="secondary">Last Modified</Typography.Text>
              <div>{element.lastModifiedAt || '-'}</div>
            </div>
          </div>
        ) : null}
        {tab === 'relationships' ? (
          <div className={styles.inspectorList}>
            {relationships.map((rel) => (
              <div key={rel.id} className={styles.inspectorRow}>
                <Typography.Text>{rel.type}</Typography.Text>
                <Typography.Text type="secondary">{`${rel.fromId} -> ${rel.toId}`}</Typography.Text>
              </div>
            ))}
          </div>
        ) : null}
        {tab === 'views' ? (
          <div className={styles.inspectorList}>
            {views.map((view) => (
              <div key={view.id} className={styles.inspectorRow}>
                <Typography.Text>{view.name}</Typography.Text>
                <Typography.Text type="secondary">
                  {view.viewpointId}
                </Typography.Text>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default CatalogBottomInspector;
