import { Button, Input, InputNumber, Select } from 'antd';
import React from 'react';
import styles from '../catalog.module.less';
import type {
  CatalogDomain,
  CatalogFilters as CatalogFiltersState,
} from '../types/catalog.types';
import { CATALOG_DOMAIN_TYPES } from '../types/catalog.types';

const lifecycleOptions = [
  { value: 'Draft', label: 'Draft' },
  { value: 'Active', label: 'Active' },
  { value: 'Retired', label: 'Retired' },
];

const usedInViewsOptions = [
  { value: 'any', label: 'Any' },
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

export type CatalogFiltersProps = {
  domain: CatalogDomain;
  filters: CatalogFiltersState;
  onFiltersChange: (filters: CatalogFiltersState) => void;
};

export const CatalogFilters: React.FC<CatalogFiltersProps> = ({
  domain,
  filters,
  onFiltersChange,
}) => {
  const typeOptions = CATALOG_DOMAIN_TYPES[domain].map((type) => ({
    value: type,
    label: type,
  }));

  const updateFilters = (next: Partial<CatalogFiltersState>) => {
    onFiltersChange({
      ...filters,
      ...next,
    });
  };

  const ownerValue = filters.owner.join(', ');

  return (
    <div className={styles.catalogFilters}>
      <div className={styles.filterBlock}>
        <div className={styles.filterLabel}>Type</div>
        <Select
          mode="multiple"
          value={filters.type}
          onChange={(value) => updateFilters({ type: value })}
          options={typeOptions}
          className={styles.filterControl}
          placeholder="All types"
        />
      </div>
      <div className={styles.filterBlock}>
        <div className={styles.filterLabel}>Lifecycle</div>
        <Select
          mode="multiple"
          value={filters.lifecycle}
          onChange={(value) => updateFilters({ lifecycle: value })}
          options={lifecycleOptions}
          className={styles.filterControl}
          placeholder="All"
        />
      </div>
      <div className={styles.filterBlock}>
        <div className={styles.filterLabel}>Owner</div>
        <Input
          value={ownerValue}
          onChange={(event) => {
            const raw = event.target.value;
            const owners = raw
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean);
            updateFilters({ owner: owners });
          }}
          placeholder="Search owners"
          className={styles.filterControl}
        />
      </div>
      <div className={styles.filterBlock}>
        <div className={styles.filterLabel}>Relationship Count &gt; X</div>
        <InputNumber
          min={0}
          value={filters.relationshipCountMin}
          onChange={(value) =>
            updateFilters({
              relationshipCountMin:
                typeof value === 'number' ? value : undefined,
            })
          }
          className={styles.filterControl}
        />
      </div>
      <div className={styles.filterBlock}>
        <div className={styles.filterLabel}>Relationship Count &lt;= X</div>
        <InputNumber
          min={0}
          value={filters.relationshipCountMax}
          onChange={(value) =>
            updateFilters({
              relationshipCountMax:
                typeof value === 'number' ? value : undefined,
            })
          }
          className={styles.filterControl}
        />
      </div>
      <div className={styles.filterBlock}>
        <div className={styles.filterLabel}>Used In Views</div>
        <Select
          value={
            filters.usedInViews === undefined
              ? 'any'
              : String(filters.usedInViews)
          }
          onChange={(value) => {
            if (value === 'any') updateFilters({ usedInViews: undefined });
            else updateFilters({ usedInViews: value === 'true' });
          }}
          options={usedInViewsOptions}
          className={styles.filterControl}
        />
      </div>
      <div className={styles.filterBlock}>
        <div className={styles.filterLabel}>Criticality</div>
        <Input
          value={filters.criticality.join(', ')}
          onChange={(event) => {
            const values = event.target.value
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean);
            updateFilters({ criticality: values });
          }}
          placeholder="High, Medium"
          className={styles.filterControl}
        />
      </div>
      <div className={`${styles.filterBlock} ${styles.filterAction}`}>
        <div className={styles.filterLabel}>&nbsp;</div>
        <Button
          size="small"
          onClick={() =>
            onFiltersChange({
              type: [],
              lifecycle: [],
              owner: [],
              criticality: [],
              relationshipCountMin: undefined,
              relationshipCountMax: undefined,
              usedInViews: undefined,
            })
          }
        >
          Clear Filters
        </Button>
      </div>
    </div>
  );
};
