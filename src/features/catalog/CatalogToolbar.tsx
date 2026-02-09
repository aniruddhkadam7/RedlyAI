import {
  ColumnWidthOutlined,
  DownloadOutlined,
  FilterOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Button, Input, Popover, Tag, Typography } from 'antd';
import React from 'react';
import styles from './catalog.module.less';

type CatalogToolbarProps = {
  domainLabel: string;
  total: number;
  search: string;
  onSearchChange: (value: string) => void;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  columnMenu: React.ReactNode;
  bulkActions: React.ReactNode;
  onExport: () => void;
};

const CatalogToolbar: React.FC<CatalogToolbarProps> = ({
  domainLabel,
  total,
  search,
  onSearchChange,
  filtersOpen,
  onToggleFilters,
  columnMenu,
  bulkActions,
  onExport,
}) => (
  <div className={styles.registryHeader}>
    <div className={styles.registryTitle}>
      <Typography.Text strong>Architecture Registry</Typography.Text>
      <Tag>{domainLabel}</Tag>
      <Typography.Text type="secondary">{total} elements</Typography.Text>
    </div>
    <div className={styles.registryToolbar}>
      <Input
        allowClear
        placeholder="Search elements"
        prefix={<SearchOutlined />}
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        className={styles.searchInput}
      />
      <Button
        icon={<FilterOutlined />}
        className={filtersOpen ? styles.filterButtonActive : undefined}
        onClick={onToggleFilters}
      >
        Filter
      </Button>
      <Popover placement="bottom" trigger="click" content={columnMenu}>
        <Button icon={<ColumnWidthOutlined />}>Columns</Button>
      </Popover>
      <Button icon={<DownloadOutlined />} onClick={onExport}>
        Export
      </Button>
      {bulkActions}
    </div>
  </div>
);

export default CatalogToolbar;
