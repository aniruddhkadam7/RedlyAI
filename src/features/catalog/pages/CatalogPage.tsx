import { MoreOutlined } from '@ant-design/icons';
import { history, useParams } from '@umijs/max';
import { Button, Dropdown, Modal } from 'antd';
import React from 'react';
import { useIdeShell } from '@/components/IdeShellLayout';
import { ViewLayoutStore } from '@/diagram-studio/view-runtime/ViewLayoutStore';
import { ViewStore } from '@/diagram-studio/view-runtime/ViewStore';
import type { ViewInstance } from '@/diagram-studio/viewpoints/ViewInstance';
import { ViewpointRegistry } from '@/diagram-studio/viewpoints/ViewpointRegistry';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import CatalogBottomInspector from '../CatalogBottomInspector';
import CatalogGrid from '../CatalogGrid';
import CatalogToolbar from '../CatalogToolbar';
import styles from '../catalog.module.less';
import { CatalogFilters } from '../components/CatalogFilters';
import ImportHistoryModal from '../import/components/ImportHistoryModal';
import type {
  CatalogDomain,
  CatalogElement,
  CatalogFilters as CatalogFiltersState,
  CatalogQueryState,
  CatalogSortState,
} from '../types/catalog.types';
import {
  CATALOG_DOMAIN_LABELS,
  CATALOG_DOMAIN_TYPES,
  CATALOG_DOMAINS,
} from '../types/catalog.types';
import { useCatalogController } from '../useCatalogController';

const isCatalogDomain = (value: string | undefined): value is CatalogDomain =>
  Boolean(value && CATALOG_DOMAINS.includes(value as CatalogDomain));

const defaultFilters: CatalogFiltersState = {
  type: [],
  lifecycle: [],
  owner: [],
  criticality: [],
  relationshipCountMin: undefined,
  relationshipCountMax: undefined,
  usedInViews: undefined,
};

const domainForType = (type: string): CatalogDomain => {
  for (const domain of CATALOG_DOMAINS) {
    if (CATALOG_DOMAIN_TYPES[domain].includes(type)) return domain;
  }
  return 'business';
};

const useDebouncedValue = (value: string, delay: number) => {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

const CatalogPage: React.FC = () => {
  const params = useParams<{ domain?: string }>();
  const domain = isCatalogDomain(params.domain)
    ? (params.domain as CatalogDomain)
    : 'business';
  const { eaRepository } = useEaRepository();
  const { openPropertiesPanel } = useIdeShell();

  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebouncedValue(search, 200);
  const [filters, setFilters] =
    React.useState<CatalogFiltersState>(defaultFilters);
  const [sort, setSort] = React.useState<CatalogSortState>({});
  const [selectedRowKeys, setSelectedRowKeys] = React.useState<React.Key[]>([]);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [highlightId, setHighlightId] = React.useState<string | null>(null);
  const [inspectorId, setInspectorId] = React.useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = React.useState<
    'details' | 'relationships' | 'views'
  >('details');
  const [visibleColumns, setVisibleColumns] = React.useState<string[]>([
    'name',
    'elementType',
    'owner',
    'lifecycle',
    'status',
    'criticality',
    'relationshipsCount',
    'usedInViewsCount',
    'lastModifiedAt',
    'createdAt',
  ]);
  const [scrollY, setScrollY] = React.useState(520);
  const [importHistoryOpen, setImportHistoryOpen] = React.useState(false);

  const queryState: CatalogQueryState = React.useMemo(
    () => ({ search: debouncedSearch, filter: filters, sort }),
    [debouncedSearch, filters, sort],
  );

  const {
    rows,
    total,
    updateField,
    bulkUpdateLifecycle,
    removeElements,
    findInspectorElement,
    getInspectorRelationships,
    getInspectorViews,
  } = useCatalogController(domain, queryState);

  React.useEffect(() => {
    try {
      localStorage.setItem('ea.catalogDefined', 'true');
      window.dispatchEvent(new Event('ea:catalogDefined'));
    } catch {
      // Best-effort only.
    }
  }, []);

  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ elementId?: string }>).detail;
      const elementId = String(detail?.elementId ?? '').trim();
      if (!elementId || !eaRepository) return;
      const element = eaRepository.objects.get(elementId);
      if (!element) return;
      const nextDomain = domainForType(element.type);
      if (nextDomain !== domain) {
        history.push(`/catalog/${nextDomain}`);
      }
      setSearch(elementId);
      setHighlightId(elementId);
      setInspectorId(elementId);
      setInspectorTab('details');
      window.setTimeout(() => setHighlightId(null), 3000);
    };
    window.addEventListener('ea:catalog.reveal', handler as EventListener);
    return () =>
      window.removeEventListener('ea:catalog.reveal', handler as EventListener);
  }, [domain, eaRepository]);

  React.useEffect(() => {
    const recompute = () => {
      const height = window.innerHeight - 280;
      setScrollY(Math.max(320, height));
    };
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, []);

  React.useEffect(() => {
    const allowed = new Set(rows.map((row) => row.id));
    setSelectedRowKeys((prev) =>
      prev.filter((key) => allowed.has(String(key))),
    );
  }, [rows]);

  const handleDelete = React.useCallback(
    (ids: string[]) => {
      Modal.confirm({
        title: 'Delete selected elements?',
        content: `This will remove ${ids.length} element(s) and related relationships from the repository.`,
        okText: 'Delete',
        okButtonProps: { danger: true },
        cancelText: 'Cancel',
        onOk: () => removeElements(ids),
      });
    },
    [removeElements],
  );

  const handleRowAction = React.useCallback(
    (
      record: CatalogElement,
      action: 'reveal' | 'new-view' | 'relationships' | 'delete',
    ) => {
      if (action === 'delete') {
        handleDelete([record.id]);
        return;
      }
      if (action === 'relationships') {
        setInspectorId(record.id);
        setInspectorTab('relationships');
        return;
      }
      if (action === 'reveal') {
        window.dispatchEvent(
          new CustomEvent('ea:studio.focus', {
            detail: { elementId: record.id },
          }),
        );
        return;
      }
      if (action === 'new-view') {
        const viewpoint = ViewpointRegistry.list().find((vp) =>
          vp.allowedElementTypes.includes(record.elementType as any),
        );
        const id = `view_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const view: ViewInstance = {
          id,
          name: `${record.name} View`,
          description: `Auto-generated view for ${record.name}.`,
          viewpointId: viewpoint?.id ?? 'application-landscape',
          scope: { kind: 'ManualSelection', elementIds: [record.id] } as const,
          layoutMetadata: {},
          createdAt: new Date().toISOString(),
          createdBy: 'catalog',
          status: 'SAVED' as const,
        };
        ViewStore.save(view);
        ViewLayoutStore.remove(view.id);
        window.dispatchEvent(
          new CustomEvent('ea:studio.view.open', {
            detail: { viewId: view.id, view },
          }),
        );
      }
    },
    [handleDelete],
  );

  const handleUsedInViewsClick = (record: CatalogElement) => {
    setInspectorId(record.id);
    setInspectorTab('views');
  };

  const bulkActions = (
    <Dropdown
      menu={{
        items: [
          { key: 'bulk-active', label: 'Mark Active' },
          { key: 'bulk-draft', label: 'Mark Draft' },
          { key: 'bulk-retired', label: 'Mark Retired' },
          { key: 'bulk-delete', label: 'Delete' },
        ],
        onClick: (info) => {
          const ids = selectedRowKeys.map(String);
          if (info.key === 'bulk-delete') {
            handleDelete(ids);
            return;
          }
          const lifecycle =
            info.key === 'bulk-active'
              ? 'Active'
              : info.key === 'bulk-retired'
                ? 'Retired'
                : 'Draft';
          bulkUpdateLifecycle(ids, lifecycle);
        },
      }}
      trigger={['click']}
    >
      <Button icon={<MoreOutlined />} disabled={selectedRowKeys.length === 0}>
        Bulk Actions
      </Button>
    </Dropdown>
  );

  const columnMenu = (
    <div className={styles.columnMenu}>
      {[
        { key: 'name', label: 'Name' },
        { key: 'elementType', label: 'Type' },
        { key: 'owner', label: 'Owner' },
        { key: 'lifecycle', label: 'Lifecycle' },
        { key: 'status', label: 'Status' },
        { key: 'criticality', label: 'Criticality' },
        { key: 'relationshipsCount', label: 'Relationships' },
        { key: 'usedInViewsCount', label: 'Used In Views' },
        { key: 'lastModifiedAt', label: 'Last Modified' },
        { key: 'createdAt', label: 'Created Date' },
        { key: 'actions', label: 'Actions' },
      ].map((col) => (
        <label key={col.key} className={styles.columnToggle}>
          <input
            type="checkbox"
            checked={visibleColumns.includes(col.key)}
            onChange={(event) => {
              setVisibleColumns((prev) =>
                event.target.checked
                  ? [...prev, col.key]
                  : prev.filter((key) => key !== col.key),
              );
            }}
          />
          {col.label}
        </label>
      ))}
    </div>
  );

  const inspectorElement = findInspectorElement(inspectorId);
  const hasInspector = Boolean(inspectorElement);

  return (
    <div className={styles.registryPage}>
      <CatalogToolbar
        domainLabel={CATALOG_DOMAIN_LABELS[domain]}
        total={total}
        search={search}
        onSearchChange={setSearch}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((prev) => !prev)}
        columnMenu={columnMenu}
        bulkActions={bulkActions}
        onExport={() => {
          const headers = visibleColumns.filter((key) => key !== 'actions');
          const lines = [headers.join(',')];
          rows.forEach((row) => {
            const values = headers.map((key) =>
              String((row as any)[key] ?? '').replace(/\n/g, ' '),
            );
            lines.push(
              values.map((v) => `"${v.replace(/"/g, '""')}"`).join(','),
            );
          });
          const blob = new Blob([lines.join('\n')], {
            type: 'text/csv;charset=utf-8;',
          });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `catalog-${domain}.csv`;
          link.click();
          URL.revokeObjectURL(url);
        }}
        onImportCsv={
          domain === 'application'
            ? () => history.push('/catalog/applications/import')
            : undefined
        }
        onImportHistory={
          domain === 'application'
            ? () => setImportHistoryOpen(true)
            : undefined
        }
      />

      <div
        className={
          filtersOpen ? styles.filterPanelOpen : styles.filterPanelClosed
        }
      >
        <div className={styles.filterPanelInner}>
          <CatalogFilters
            domain={domain}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>
      </div>

      <div
        className={`${styles.registryBody} ${!hasInspector ? styles.registryBodyFull : ''}`}
      >
        <div className={styles.registryGrid}>
          <CatalogGrid
            data={rows}
            loading={!eaRepository}
            onRowClick={(record) => {
              setInspectorId(null);
              openPropertiesPanel({
                elementId: record.id,
                elementType: record.elementType,
                dock: 'bottom',
              });
            }}
            onEmptyClick={() => setInspectorId(null)}
            onSortChange={setSort}
            onUpdateField={updateField}
            onAction={handleRowAction}
            onUsedInViewsClick={handleUsedInViewsClick}
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
            }}
            highlightId={highlightId}
            visibleColumns={visibleColumns}
            scrollY={scrollY}
          />
        </div>
        <CatalogBottomInspector
          element={inspectorElement}
          tab={inspectorTab}
          onTabChange={setInspectorTab}
          onClose={() => setInspectorId(null)}
          relationships={
            inspectorElement
              ? getInspectorRelationships(inspectorElement.id)
              : []
          }
          views={inspectorElement ? getInspectorViews(inspectorElement.id) : []}
        />
      </div>
      <ImportHistoryModal
        open={importHistoryOpen}
        onClose={() => setImportHistoryOpen(false)}
      />
    </div>
  );
};

export default CatalogPage;
