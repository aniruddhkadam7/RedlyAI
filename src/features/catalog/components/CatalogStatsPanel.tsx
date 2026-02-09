import { Card, Divider, Statistic } from 'antd';
import React from 'react';
import styles from '../catalog.module.less';
import type { CatalogStats } from '../types/catalog.types';

export type CatalogStatsPanelProps = {
  stats: CatalogStats | null;
  loading: boolean;
};

const CatalogStatsPanel: React.FC<CatalogStatsPanelProps> = ({
  stats,
  loading,
}) => {
  return (
    <Card
      className={styles.statsPanel}
      title="Catalog Summary"
      loading={loading}
      size="small"
    >
      <div className={styles.statsGrid}>
        <Statistic title="Total Elements" value={stats?.total ?? 0} />
        <Statistic title="Active" value={stats?.active ?? 0} />
        <Statistic title="Draft" value={stats?.draft ?? 0} />
        <Statistic title="Retired" value={stats?.retired ?? 0} />
      </div>
      <Divider />
      <Statistic
        title="Relationship Density"
        value={stats?.relationshipDensity ?? 0}
        precision={2}
      />
    </Card>
  );
};

export default CatalogStatsPanel;
