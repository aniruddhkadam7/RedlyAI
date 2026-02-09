import React from 'react';
import CatalogTable from './components/CatalogTable';
import type { CatalogElement, CatalogSortState } from './types/catalog.types';

type CatalogGridProps = {
  data: CatalogElement[];
  loading: boolean;
  onRowClick: (record: CatalogElement) => void;
  onEmptyClick?: () => void;
  onSortChange: (sort: CatalogSortState) => void;
  onUpdateField: (args: {
    id: string;
    field: 'name' | 'owner' | 'lifecycle' | 'status';
    value: string;
  }) => void;
  onAction: (
    record: CatalogElement,
    action: 'reveal' | 'new-view' | 'relationships' | 'delete',
  ) => void;
  onUsedInViewsClick: (record: CatalogElement) => void;
  rowSelection: {
    selectedRowKeys: React.Key[];
    onChange: (selectedRowKeys: React.Key[]) => void;
  };
  highlightId?: string | null;
  visibleColumns: string[];
  scrollY: number;
};

const CatalogGrid: React.FC<CatalogGridProps> = (props) => (
  <CatalogTable {...props} />
);

export default CatalogGrid;
