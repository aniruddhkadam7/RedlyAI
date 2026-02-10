import {
  Button,
  Empty,
  Input,
  Modal,
  Table,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import React from 'react';
import type { ViewInstance } from '@/diagram-studio/viewpoints/ViewInstance';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import { message } from '@/ea/eaConsole';
import { useAppTheme } from '@/theme/ThemeContext';
import type { Baseline } from '../../../backend/baselines/Baseline';
import {
  createBaseline,
  listBaselines,
} from '../../../backend/baselines/BaselineStore';
import type {
  RepositoryDiagramRecord,
  RepositoryElementRecord,
  RepositoryRelationshipRecord,
} from '../../../backend/services/repository/packageTypes';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export type BaselineViewerTabProps = {
  baselineId: string;
};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------
type ChangedElement = {
  id: string;
  name: string;
  elementType: string;
  layer: string;
  changedFields: string[];
};

type ChangedRelationship = {
  id: string;
  relationshipType: string;
  summary: string;
  changedFields: string[];
};

type ComparisonResult = {
  comparedAt: string;
  currentElementsRevision: number;
  currentRelationshipsRevision: number;
  addedElements: RepositoryElementRecord[];
  removedElements: RepositoryElementRecord[];
  changedElements: ChangedElement[];
  addedRelationships: RepositoryRelationshipRecord[];
  removedRelationships: RepositoryRelationshipRecord[];
  changedRelationships: ChangedRelationship[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const formatDateTime = (value?: string) => {
  if (!value) return '-';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString();
  } catch {
    return value;
  }
};

const formatShortDate = (value?: string) => {
  if (!value) return '-';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString();
  } catch {
    return value;
  }
};

const stableStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value, Object.keys(value as any).sort());
  } catch {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
};

const extractUpdatedAt = (properties: Record<string, unknown>): string => {
  const raw =
    properties.updatedAt ??
    properties.lastModifiedAt ??
    properties.updated_on ??
    properties.modifiedAt;
  return typeof raw === 'string' ? raw : '';
};

const diffFields = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  ignore: Set<string>,
) => {
  const keys = new Set<string>();
  for (const k of Object.keys(a)) keys.add(k);
  for (const k of Object.keys(b)) keys.add(k);

  const changed: string[] = [];
  for (const key of keys) {
    if (ignore.has(key)) continue;
    const left = (a as any)[key];
    const right = (b as any)[key];
    if (stableStringify(left) !== stableStringify(right)) changed.push(key);
  }
  return changed.sort((x, y) => x.localeCompare(y));
};

const estimateSnapshotSize = (b: Baseline): string => {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(b.snapshot)).length;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  } catch {
    return '-';
  }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const BaselineViewerTab: React.FC<BaselineViewerTabProps> = ({
  baselineId,
}) => {
  const { token } = theme.useToken();
  const { isDark } = useAppTheme();
  const { eaRepository, loadRepositoryFromJsonText } = useEaRepository();

  // --- State ---------------------------------------------------------------
  const [allBaselines, setAllBaselines] = React.useState<Baseline[]>(() => [
    ...(listBaselines() as Baseline[]),
  ]);
  const [selectedId, setSelectedId] = React.useState<string>(baselineId);
  const [comparison, setComparison] = React.useState<ComparisonResult | null>(
    null,
  );
  const [compareError, setCompareError] = React.useState<string | null>(null);
  const [showCompare, setShowCompare] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState('');
  const [createDesc, setCreateDesc] = React.useState('');

  const selectedBaseline = React.useMemo(
    () => allBaselines.find((b) => b.id === selectedId) ?? null,
    [allBaselines, selectedId],
  );

  const refreshList = React.useCallback(() => {
    setAllBaselines([...(listBaselines() as Baseline[])]);
  }, []);

  React.useEffect(() => {
    setSelectedId(baselineId);
    refreshList();
  }, [baselineId, refreshList]);

  // --- Last snapshot date --------------------------------------------------
  const lastSnapshot = React.useMemo(() => {
    if (allBaselines.length === 0) return '-';
    const sorted = [...allBaselines].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return formatDateTime(sorted[0].createdAt);
  }, [allBaselines]);

  // --- Current snapshot loader for comparison ------------------------------
  const loadCurrentSnapshot = React.useCallback(() => {
    if (!eaRepository) {
      return {
        elements: [] as RepositoryElementRecord[],
        relationships: [] as RepositoryRelationshipRecord[],
        elementsRevision: 0,
        relationshipsRevision: 0,
      };
    }
    const elements: RepositoryElementRecord[] = Array.from(
      eaRepository.objects.values(),
    ).map((obj) => ({
      id: obj.id,
      type: obj.type,
      name:
        typeof (obj.attributes as any)?.name === 'string'
          ? String((obj.attributes as any).name)
          : null,
      properties: { ...(obj.attributes ?? {}) },
      workspaceId: obj.workspaceId,
    }));
    const relationships: RepositoryRelationshipRecord[] =
      eaRepository.relationships.map((rel) => ({
        id:
          rel.id ?? `rel-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        sourceId: rel.fromId,
        targetId: rel.toId,
        type: rel.type,
        properties: { ...(rel.attributes ?? {}) },
      }));
    return {
      elements,
      relationships,
      elementsRevision: elements.length,
      relationshipsRevision: relationships.length,
    };
  }, [eaRepository]);

  // --- Compare -------------------------------------------------------------
  const computeComparison = React.useCallback(
    (baseline: Baseline) => {
      try {
        const current = loadCurrentSnapshot();
        const baselineById = new Map(baseline.elements.map((e) => [e.id, e]));
        const currentById = new Map(current.elements.map((e) => [e.id, e]));

        const addedElements: RepositoryElementRecord[] = [];
        const removedElements: RepositoryElementRecord[] = [];
        const changedElements: ChangedElement[] = [];

        currentById.forEach((curr, id) => {
          if (!baselineById.has(id)) {
            addedElements.push(curr);
            return;
          }
          const base = baselineById.get(id);
          if (!base) return;
          const baseUpdatedAt = extractUpdatedAt(base.properties);
          const currUpdatedAt = extractUpdatedAt(curr.properties);
          const changedByTimestamp =
            baseUpdatedAt && currUpdatedAt && baseUpdatedAt !== currUpdatedAt;
          const changedByProps =
            !changedByTimestamp &&
            stableStringify(base.properties) !==
              stableStringify(curr.properties);
          if (changedByTimestamp || changedByProps) {
            const changed = diffFields(
              base.properties,
              curr.properties,
              new Set(),
            );
            changedElements.push({
              id: curr.id,
              name: curr.name ?? curr.id,
              elementType: curr.type,
              layer: String((curr.properties as any)?.layer ?? ''),
              changedFields: changed.length > 0 ? changed : ['updatedAt'],
            });
          }
        });
        baselineById.forEach((base, id) => {
          if (!currentById.has(id)) removedElements.push(base);
        });

        const baselineRelById = new Map(
          baseline.relationships.map((r) => [r.id, r]),
        );
        const currentRelById = new Map(
          current.relationships.map((r) => [r.id, r]),
        );
        const addedRelationships: RepositoryRelationshipRecord[] = [];
        const removedRelationships: RepositoryRelationshipRecord[] = [];
        const changedRelationships: ChangedRelationship[] = [];

        currentRelById.forEach((curr, id) => {
          if (!baselineRelById.has(id)) {
            addedRelationships.push(curr);
            return;
          }
          const base = baselineRelById.get(id);
          if (!base) return;
          const baseUpdatedAt = extractUpdatedAt(base.properties);
          const currUpdatedAt = extractUpdatedAt(curr.properties);
          const changedByTimestamp =
            baseUpdatedAt && currUpdatedAt && baseUpdatedAt !== currUpdatedAt;
          const changedByProps =
            !changedByTimestamp &&
            stableStringify(base.properties) !==
              stableStringify(curr.properties);
          if (changedByTimestamp || changedByProps) {
            const changed = diffFields(
              base.properties,
              curr.properties,
              new Set(),
            );
            changedRelationships.push({
              id: curr.id,
              relationshipType: curr.type,
              summary: `${curr.sourceId} \u2192 ${curr.targetId}`,
              changedFields: changed.length > 0 ? changed : ['updatedAt'],
            });
          }
        });
        baselineRelById.forEach((base, id) => {
          if (!currentRelById.has(id)) removedRelationships.push(base);
        });

        setComparison({
          comparedAt: new Date().toISOString(),
          currentElementsRevision: current.elementsRevision,
          currentRelationshipsRevision: current.relationshipsRevision,
          addedElements,
          removedElements,
          changedElements,
          addedRelationships,
          removedRelationships,
          changedRelationships,
        });
        setCompareError(null);
        setShowCompare(true);
      } catch (err) {
        setCompareError(
          err instanceof Error
            ? err.message
            : 'Unable to compare against current repository.',
        );
        setShowCompare(true);
      }
    },
    [loadCurrentSnapshot],
  );

  // --- Restore -------------------------------------------------------------
  const toViewInstance = React.useCallback(
    (diagram: RepositoryDiagramRecord): ViewInstance => ({
      id: diagram.id,
      name: diagram.title,
      description: diagram.description ?? '',
      viewpointId: diagram.viewpointId,
      scope: (diagram.scope as any) ?? { kind: 'EntireRepository' },
      layoutMetadata: diagram.layoutMetadata ?? {},
      createdAt: diagram.createdAt ?? new Date().toISOString(),
      createdBy: diagram.createdBy ?? 'baseline',
      status: 'SAVED',
      visibleRelationshipIds: diagram.visibleRelationshipIds,
    }),
    [],
  );

  const handleRestore = React.useCallback(
    (baseline: Baseline) => {
      Modal.confirm({
        title: 'Restore baseline?',
        content:
          'This will replace the current repository state with the baseline snapshot. This action cannot be undone.',
        okText: 'Restore',
        okButtonProps: { danger: true },
        onOk: () => {
          const snapshot = {
            version: 1 as const,
            metadata: baseline.snapshot.metadata as any,
            objects: baseline.snapshot.elements.map((el) => ({
              id: el.id,
              type: el.type as any,
              workspaceId: el.workspaceId,
              attributes: { ...(el.properties ?? {}) },
            })),
            relationships: baseline.snapshot.relationships.map((rel) => ({
              id: rel.id,
              fromId: rel.sourceId,
              toId: rel.targetId,
              type: rel.type as any,
              attributes: { ...(rel.properties ?? {}) },
            })),
            views: baseline.snapshot.diagrams.map(toViewInstance),
            studioState: {
              viewLayouts: baseline.snapshot.layouts.viewLayouts ?? {},
              designWorkspaces: [],
            },
            updatedAt: new Date().toISOString(),
          };
          const res = loadRepositoryFromJsonText(JSON.stringify(snapshot));
          if (!res.ok) {
            message.error(res.error);
            return;
          }
          message.success('Repository restored to baseline.');
        },
      });
    },
    [loadRepositoryFromJsonText, toViewInstance],
  );

  // --- Create baseline -----------------------------------------------------
  const handleCreate = React.useCallback(() => {
    const name = createName.trim();
    if (!name) {
      message.error('Baseline name is required.');
      return;
    }
    try {
      const created = createBaseline({
        name,
        description: createDesc.trim() || undefined,
      });
      message.success(`Baseline "${created.name}" created.`);
      setCreateOpen(false);
      setCreateName('');
      setCreateDesc('');
      refreshList();
      setSelectedId(created.id);
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : 'Failed to create baseline.',
      );
    }
  }, [createName, createDesc, refreshList]);

  // --- Export snapshot (download JSON) -------------------------------------
  const handleExportSnapshot = React.useCallback((baseline: Baseline) => {
    try {
      const json = JSON.stringify(baseline.snapshot, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseline.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_snapshot.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('Snapshot exported.');
    } catch {
      message.error('Failed to export snapshot.');
    }
  }, []);

  // --- Styles (theme-aware) ------------------------------------------------
  const styles = React.useMemo(() => {
    // Use colorBorder for visible separation in both themes
    const borderColor = token.colorBorder;
    const borderSubtle = token.colorBorderSecondary;
    const sectionBg = isDark
      ? token.colorBgElevated
      : token.colorFillQuaternary;
    const surfaceBg = token.colorBgContainer;
    const panelBg = isDark ? token.colorBgElevated : token.colorFillAlter;
    const textPrimary = token.colorText;
    const textSecondary = token.colorTextSecondary;
    const textTertiary = token.colorTextTertiary;
    const rowAltBg = token.colorFillQuaternary;
    const rowHoverBg = token.colorFillTertiary;

    return {
      root: {
        display: 'flex',
        flexDirection: 'column' as const,
        height: '100%',
        overflow: 'hidden',
        background: surfaceBg,
        color: textPrimary,
        border: `1px solid ${borderColor}`,
      },
      header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: `1px solid ${borderColor}`,
        background: sectionBg,
        flexShrink: 0,
      },
      headerLeft: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 0,
      },
      headerTitle: {
        fontSize: 15,
        fontWeight: 600,
        lineHeight: '20px',
        color: textPrimary,
        margin: 0,
      },
      headerSubtitle: {
        fontSize: 11,
        color: textSecondary,
        lineHeight: '16px',
        margin: 0,
      },
      headerRight: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        fontSize: 12,
        color: textSecondary,
      },
      headerStat: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'flex-end' as const,
      },
      headerStatLabel: {
        fontSize: 10,
        textTransform: 'uppercase' as const,
        color: textTertiary,
        letterSpacing: '0.5px',
      },
      headerStatValue: {
        fontSize: 13,
        fontWeight: 500,
        color: textPrimary,
      },
      toolbar: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 16px',
        borderBottom: `1px solid ${borderColor}`,
        background: sectionBg,
        flexShrink: 0,
      },
      body: {
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
      },
      gridArea: {
        flex: 1,
        overflow: 'auto',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column' as const,
      },
      detailPanel: {
        width: 280,
        flexShrink: 0,
        borderLeft: `1px solid ${borderColor}`,
        background: panelBg,
        overflowY: 'auto' as const,
        padding: 0,
      },
      detailHeader: {
        padding: '10px 14px 8px',
        borderBottom: `1px solid ${borderColor}`,
        background: sectionBg,
      },
      detailTitle: {
        fontSize: 13,
        fontWeight: 600,
        color: textPrimary,
        margin: 0,
        lineHeight: '18px',
      },
      detailDesc: {
        fontSize: 11,
        color: textSecondary,
        margin: '2px 0 0',
        lineHeight: '16px',
      },
      detailSection: {
        padding: '0',
      },
      detailRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '6px 14px',
        borderBottom: `1px solid ${borderSubtle}`,
        fontSize: 12,
      },
      detailLabel: {
        color: textTertiary,
        fontSize: 11,
        flexShrink: 0,
        minWidth: 100,
      },
      detailValue: {
        color: textPrimary,
        fontSize: 12,
        fontWeight: 600,
        textAlign: 'right' as const,
        wordBreak: 'break-all' as const,
      },
      emptyContainer: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        gap: 12,
      },
      actionBtn: {
        fontSize: 12,
        padding: '1px 8px',
        height: 24,
      } as React.CSSProperties,
      comparePanel: {
        borderTop: `1px solid ${borderColor}`,
        background: sectionBg,
        overflow: 'auto',
        maxHeight: '40%',
        flexShrink: 0,
      },
      comparePanelHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px',
        borderBottom: `1px solid ${borderColor}`,
        background: surfaceBg,
      },
      compareStat: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        fontSize: 11,
        border: `1px solid ${borderColor}`,
        borderRadius: 3,
        background: surfaceBg,
        color: textSecondary,
      } as React.CSSProperties,
      compareStatValue: {
        fontWeight: 600,
        color: textPrimary,
      },
      tableContainer: {
        flex: 1,
        overflow: 'auto',
        '--baseline-row-alt': rowAltBg,
        '--baseline-row-hover': rowHoverBg,
        '--baseline-row-border': borderSubtle,
        '--baseline-col-border': isDark
          ? token.colorFillTertiary
          : token.colorFillSecondary,
        '--baseline-thead-bg': sectionBg,
        '--baseline-thead-border': borderColor,
      } as React.CSSProperties,
    };
  }, [token, isDark]);

  // --- Table columns -------------------------------------------------------
  const columns: ColumnsType<Baseline> = React.useMemo(
    () => [
      {
        title: 'Name',
        dataIndex: 'name',
        key: 'name',
        sorter: (a: Baseline, b: Baseline) =>
          (a.name ?? '').localeCompare(b.name ?? ''),
        ellipsis: true,
        width: 200,
        render: (name: string) => (
          <span style={{ fontWeight: 500 }}>{name || 'Untitled'}</span>
        ),
      },
      {
        title: 'Created',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 130,
        sorter: (a: Baseline, b: Baseline) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        defaultSortOrder: 'descend',
        render: (v: string) => (
          <span style={{ fontSize: 12 }}>{formatShortDate(v)}</span>
        ),
      },
      {
        title: 'Created By',
        dataIndex: 'createdBy',
        key: 'createdBy',
        width: 120,
        ellipsis: true,
        render: (v: string) => v || '-',
      },
      {
        title: 'Elements',
        key: 'elements',
        width: 80,
        align: 'right' as const,
        sorter: (a: Baseline, b: Baseline) =>
          (a.elementCount ?? a.elements.length) -
          (b.elementCount ?? b.elements.length),
        render: (_: unknown, row: Baseline) =>
          row.elementCount ?? row.elements.length,
      },
      {
        title: 'Relationships',
        key: 'relationships',
        width: 100,
        align: 'right' as const,
        sorter: (a: Baseline, b: Baseline) =>
          (a.relationshipCount ?? a.relationships.length) -
          (b.relationshipCount ?? b.relationships.length),
        render: (_: unknown, row: Baseline) =>
          row.relationshipCount ?? row.relationships.length,
      },
      {
        title: 'Diagrams',
        key: 'diagrams',
        width: 80,
        align: 'right' as const,
        sorter: (a: Baseline, b: Baseline) =>
          (a.diagramCount ?? 0) - (b.diagramCount ?? 0),
        render: (_: unknown, row: Baseline) => row.diagramCount ?? 0,
      },
      {
        title: 'Size',
        key: 'size',
        width: 80,
        align: 'right' as const,
        render: (_: unknown, row: Baseline) => (
          <span style={{ fontSize: 11 }}>{estimateSnapshotSize(row)}</span>
        ),
      },
      {
        title: 'Description',
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
        render: (v: string) => (
          <span style={{ color: token.colorTextSecondary, fontSize: 12 }}>
            {v || '-'}
          </span>
        ),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 210,
        fixed: 'right' as const,
        render: (_: unknown, row: Baseline) => (
          <div style={{ display: 'flex', gap: 4 }}>
            <Button
              size="small"
              type="text"
              style={styles.actionBtn}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(row.id);
                computeComparison(row);
              }}
            >
              Compare
            </Button>
            <Button
              size="small"
              type="text"
              style={styles.actionBtn}
              onClick={(e) => {
                e.stopPropagation();
                handleRestore(row);
              }}
            >
              Restore
            </Button>
            <Button
              size="small"
              type="text"
              style={styles.actionBtn}
              onClick={(e) => {
                e.stopPropagation();
                handleExportSnapshot(row);
              }}
            >
              Export
            </Button>
          </div>
        ),
      },
    ],
    [
      token,
      styles.actionBtn,
      computeComparison,
      handleRestore,
      handleExportSnapshot,
    ],
  );

  // --- Comparison detail columns -------------------------------------------
  const changedElementColumns: ColumnsType<ChangedElement> = [
    { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: 'Type', dataIndex: 'elementType', key: 'elementType', width: 140 },
    { title: 'Layer', dataIndex: 'layer', key: 'layer', width: 100 },
    {
      title: 'Changed',
      dataIndex: 'changedFields',
      key: 'changedFields',
      render: (f: string[]) => f.join(', '),
    },
  ];

  const changedRelationshipColumns: ColumnsType<ChangedRelationship> = [
    { title: 'Type', dataIndex: 'relationshipType', key: 'type', width: 160 },
    { title: 'Path', dataIndex: 'summary', key: 'summary', ellipsis: true },
    {
      title: 'Changed',
      dataIndex: 'changedFields',
      key: 'changedFields',
      render: (f: string[]) => f.join(', '),
    },
  ];

  const diffElementColumns: ColumnsType<RepositoryElementRecord> = [
    { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: 'Type', dataIndex: 'type', key: 'type', width: 140 },
  ];

  const diffRelColumns: ColumnsType<RepositoryRelationshipRecord> = [
    { title: 'Type', dataIndex: 'type', key: 'type', width: 160 },
    { title: 'Source', dataIndex: 'sourceId', key: 'source', ellipsis: true },
    { title: 'Target', dataIndex: 'targetId', key: 'target', ellipsis: true },
  ];

  // --- Empty state ---------------------------------------------------------
  if (allBaselines.length === 0) {
    return (
      <div style={styles.root}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <p style={styles.headerTitle}>Baselines</p>
            <p style={styles.headerSubtitle}>Repository Snapshots</p>
          </div>
        </div>
        <div style={styles.emptyContainer}>
          <Empty description="No baselines created" />
        </div>

        <Modal
          title="Create Baseline"
          open={createOpen}
          onOk={handleCreate}
          onCancel={() => {
            setCreateOpen(false);
            setCreateName('');
            setCreateDesc('');
          }}
          okText="Create"
          width={400}
          destroyOnClose
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '4px 0',
            }}
          >
            <div>
              <Typography.Text style={{ fontSize: 12 }}>Name *</Typography.Text>
              <Input
                size="small"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Q1 2026 Current State"
                autoFocus
              />
            </div>
            <div>
              <Typography.Text style={{ fontSize: 12 }}>
                Description
              </Typography.Text>
              <Input.TextArea
                size="small"
                rows={2}
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // --- Main render ---------------------------------------------------------
  return (
    <div style={styles.root}>
      {/* Page Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <p style={styles.headerTitle}>Baselines</p>
          <p style={styles.headerSubtitle}>Repository Snapshots</p>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.headerStat}>
            <span style={styles.headerStatLabel}>Total</span>
            <span style={styles.headerStatValue}>{allBaselines.length}</span>
          </div>
          <div style={styles.headerStat}>
            <span style={styles.headerStatLabel}>Last Snapshot</span>
            <span style={styles.headerStatValue}>{lastSnapshot}</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={styles.toolbar}>
        <Button size="small" onClick={() => setCreateOpen(true)}>
          Create Baseline
        </Button>
        <Button
          size="small"
          disabled={!selectedBaseline}
          onClick={() =>
            selectedBaseline && computeComparison(selectedBaseline)
          }
        >
          Compare
        </Button>
        <Button
          size="small"
          disabled={!selectedBaseline}
          onClick={() => selectedBaseline && handleRestore(selectedBaseline)}
        >
          Restore
        </Button>
        <Button
          size="small"
          disabled={!selectedBaseline}
          onClick={() =>
            selectedBaseline && handleExportSnapshot(selectedBaseline)
          }
        >
          Export Snapshot
        </Button>
        {showCompare && (
          <Button
            size="small"
            type="text"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              setShowCompare(false);
              setComparison(null);
              setCompareError(null);
            }}
          >
            Close Compare
          </Button>
        )}
      </div>

      {/* Body: Grid + Detail Panel */}
      <div style={styles.body}>
        {/* Data Grid */}
        <div style={styles.gridArea}>
          <div style={styles.tableContainer}>
            <style>{`
              .baseline-grid .ant-table-thead > tr > th {
                position: sticky;
                top: 0;
                z-index: 2;
                padding: 6px 8px !important;
                font-size: 11px !important;
                font-weight: 600 !important;
                text-transform: uppercase;
                letter-spacing: 0.3px;
                background: var(--baseline-thead-bg) !important;
                border-bottom: 1px solid var(--baseline-thead-border) !important;
                border-right: 1px solid var(--baseline-col-border) !important;
              }
              .baseline-grid .ant-table-thead > tr > th:last-child {
                border-right: none !important;
              }
              .baseline-grid .ant-table-tbody > tr > td {
                padding: 5px 8px !important;
                font-size: 12px !important;
                border-bottom: 1px solid var(--baseline-row-border) !important;
                border-right: 1px solid var(--baseline-col-border) !important;
              }
              .baseline-grid .ant-table-tbody > tr > td:last-child {
                border-right: none !important;
              }
              .baseline-grid .ant-table-tbody > tr:nth-child(even) > td {
                background: var(--baseline-row-alt) !important;
              }
              .baseline-grid .ant-table-tbody > tr:hover > td {
                background: var(--baseline-row-hover) !important;
              }
              .baseline-grid .ant-table-tbody > tr.ant-table-row-selected > td {
                background: ${token.colorPrimaryBg} !important;
              }
              .baseline-grid .ant-table-tbody > tr {
                cursor: pointer;
              }
              .baseline-compare .ant-table-thead > tr > th {
                padding: 4px 8px !important;
                font-size: 11px !important;
                border-bottom: 1px solid var(--baseline-row-border) !important;
              }
              .baseline-compare .ant-table-tbody > tr > td {
                padding: 3px 8px !important;
                font-size: 11px !important;
                border-bottom: 1px solid var(--baseline-row-border) !important;
              }
            `}</style>
            <Table<Baseline>
              className="baseline-grid"
              size="small"
              dataSource={allBaselines}
              columns={columns}
              rowKey="id"
              scroll={{ x: 'max-content' }}
              pagination={
                allBaselines.length > 50
                  ? { pageSize: 50, showSizeChanger: true, size: 'small' }
                  : false
              }
              rowSelection={{
                type: 'radio',
                selectedRowKeys: selectedId ? [selectedId] : [],
                onChange: (keys) => {
                  if (keys.length > 0) setSelectedId(keys[0] as string);
                },
              }}
              onRow={(record) => ({
                onClick: () => setSelectedId(record.id),
              })}
            />
          </div>

          {/* Comparison Panel (bottom of grid area) */}
          {showCompare && (
            <div style={styles.comparePanel}>
              <div style={styles.comparePanelHeader}>
                <Typography.Text style={{ fontSize: 12, fontWeight: 600 }}>
                  Comparison: {selectedBaseline?.name ?? 'Baseline'} vs Current
                </Typography.Text>
                {comparison && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={styles.compareStat}>
                      Added Elem.{' '}
                      <span style={styles.compareStatValue}>
                        {comparison.addedElements.length}
                      </span>
                    </span>
                    <span style={styles.compareStat}>
                      Removed Elem.{' '}
                      <span style={styles.compareStatValue}>
                        {comparison.removedElements.length}
                      </span>
                    </span>
                    <span style={styles.compareStat}>
                      Changed{' '}
                      <span style={styles.compareStatValue}>
                        {comparison.changedElements.length}
                      </span>
                    </span>
                    <span style={styles.compareStat}>
                      Added Rel.{' '}
                      <span style={styles.compareStatValue}>
                        {comparison.addedRelationships.length}
                      </span>
                    </span>
                    <span style={styles.compareStat}>
                      Removed Rel.{' '}
                      <span style={styles.compareStatValue}>
                        {comparison.removedRelationships.length}
                      </span>
                    </span>
                    <span style={styles.compareStat}>
                      Changed Rel.{' '}
                      <span style={styles.compareStatValue}>
                        {comparison.changedRelationships.length}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {compareError && (
                <div
                  style={{
                    padding: '8px 16px',
                    color: token.colorError,
                    fontSize: 12,
                  }}
                >
                  {compareError}
                </div>
              )}

              {comparison && (
                <div style={{ padding: '8px 16px' }}>
                  <Typography.Text
                    type="secondary"
                    style={{ fontSize: 11, display: 'block', marginBottom: 8 }}
                  >
                    Compared at {formatDateTime(comparison.comparedAt)}
                  </Typography.Text>

                  {comparison.addedElements.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <Typography.Text
                        style={{ fontSize: 11, fontWeight: 600 }}
                      >
                        Added Elements ({comparison.addedElements.length})
                      </Typography.Text>
                      <Table
                        className="baseline-compare"
                        size="small"
                        dataSource={comparison.addedElements}
                        columns={diffElementColumns}
                        rowKey="id"
                        pagination={false}
                        scroll={{ x: true }}
                      />
                    </div>
                  )}

                  {comparison.removedElements.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <Typography.Text
                        style={{ fontSize: 11, fontWeight: 600 }}
                      >
                        Removed Elements ({comparison.removedElements.length})
                      </Typography.Text>
                      <Table
                        className="baseline-compare"
                        size="small"
                        dataSource={comparison.removedElements}
                        columns={diffElementColumns}
                        rowKey="id"
                        pagination={false}
                        scroll={{ x: true }}
                      />
                    </div>
                  )}

                  {comparison.changedElements.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <Typography.Text
                        style={{ fontSize: 11, fontWeight: 600 }}
                      >
                        Changed Elements ({comparison.changedElements.length})
                      </Typography.Text>
                      <Table
                        className="baseline-compare"
                        size="small"
                        dataSource={comparison.changedElements}
                        columns={changedElementColumns}
                        rowKey="id"
                        pagination={false}
                        scroll={{ x: true }}
                      />
                    </div>
                  )}

                  {comparison.addedRelationships.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <Typography.Text
                        style={{ fontSize: 11, fontWeight: 600 }}
                      >
                        Added Relationships (
                        {comparison.addedRelationships.length})
                      </Typography.Text>
                      <Table
                        className="baseline-compare"
                        size="small"
                        dataSource={comparison.addedRelationships}
                        columns={diffRelColumns}
                        rowKey="id"
                        pagination={false}
                        scroll={{ x: true }}
                      />
                    </div>
                  )}

                  {comparison.removedRelationships.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <Typography.Text
                        style={{ fontSize: 11, fontWeight: 600 }}
                      >
                        Removed Relationships (
                        {comparison.removedRelationships.length})
                      </Typography.Text>
                      <Table
                        className="baseline-compare"
                        size="small"
                        dataSource={comparison.removedRelationships}
                        columns={diffRelColumns}
                        rowKey="id"
                        pagination={false}
                        scroll={{ x: true }}
                      />
                    </div>
                  )}

                  {comparison.changedRelationships.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <Typography.Text
                        style={{ fontSize: 11, fontWeight: 600 }}
                      >
                        Changed Relationships (
                        {comparison.changedRelationships.length})
                      </Typography.Text>
                      <Table
                        className="baseline-compare"
                        size="small"
                        dataSource={comparison.changedRelationships}
                        columns={changedRelationshipColumns}
                        rowKey="id"
                        pagination={false}
                        scroll={{ x: true }}
                      />
                    </div>
                  )}

                  {comparison.addedElements.length === 0 &&
                    comparison.removedElements.length === 0 &&
                    comparison.changedElements.length === 0 &&
                    comparison.addedRelationships.length === 0 &&
                    comparison.removedRelationships.length === 0 &&
                    comparison.changedRelationships.length === 0 && (
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 12 }}
                      >
                        No differences found. Repository matches baseline.
                      </Typography.Text>
                    )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detail Side Panel */}
        {selectedBaseline && (
          <div style={styles.detailPanel}>
            <div style={styles.detailHeader}>
              <p style={styles.detailTitle}>{selectedBaseline.name}</p>
              {selectedBaseline.description && (
                <p style={styles.detailDesc}>{selectedBaseline.description}</p>
              )}
            </div>
            <div style={styles.detailSection}>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Baseline ID</span>
                <Tooltip title={selectedBaseline.id}>
                  <span
                    style={{
                      ...styles.detailValue,
                      maxWidth: 140,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'inline-block',
                    }}
                  >
                    {selectedBaseline.id}
                  </span>
                </Tooltip>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Created</span>
                <span style={styles.detailValue}>
                  {formatDateTime(selectedBaseline.createdAt)}
                </span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Created By</span>
                <span style={styles.detailValue}>
                  {selectedBaseline.createdBy || '-'}
                </span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Elements</span>
                <span style={styles.detailValue}>
                  {selectedBaseline.elementCount ??
                    selectedBaseline.elements.length}
                </span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Relationships</span>
                <span style={styles.detailValue}>
                  {selectedBaseline.relationshipCount ??
                    selectedBaseline.relationships.length}
                </span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Diagrams</span>
                <span style={styles.detailValue}>
                  {selectedBaseline.diagramCount ?? 0}
                </span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Snapshot Size</span>
                <span style={styles.detailValue}>
                  {estimateSnapshotSize(selectedBaseline)}
                </span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Source Rev.</span>
                <span style={styles.detailValue}>
                  {selectedBaseline.source.elementsRevision} /{' '}
                  {selectedBaseline.source.relationshipsRevision}
                </span>
              </div>
            </div>

            {/* Quick actions in detail panel */}
            <div
              style={{
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <Button
                size="small"
                block
                onClick={() => computeComparison(selectedBaseline)}
              >
                Compare with Current
              </Button>
              <Button
                size="small"
                block
                onClick={() => handleRestore(selectedBaseline)}
              >
                Restore
              </Button>
              <Button
                size="small"
                block
                onClick={() => handleExportSnapshot(selectedBaseline)}
              >
                Export Snapshot
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create Baseline Modal */}
      <Modal
        title="Create Baseline"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => {
          setCreateOpen(false);
          setCreateName('');
          setCreateDesc('');
        }}
        okText="Create"
        width={400}
        destroyOnClose
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '4px 0',
          }}
        >
          <div>
            <Typography.Text style={{ fontSize: 12 }}>Name *</Typography.Text>
            <Input
              size="small"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Q1 2026 Current State"
              autoFocus
            />
          </div>
          <div>
            <Typography.Text style={{ fontSize: 12 }}>
              Description
            </Typography.Text>
            <Input.TextArea
              size="small"
              rows={2}
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              placeholder="Optional description"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default BaselineViewerTab;
