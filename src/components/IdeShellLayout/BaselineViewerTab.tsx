import React from 'react';
import { Alert, Button, Card, Descriptions, Empty, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getBaselineById } from '../../../backend/baselines/BaselineStore';
import type { Baseline } from '../../../backend/baselines/Baseline';
import type { BaseArchitectureElement } from '../../../backend/repository/BaseArchitectureElement';
import type { BaseArchitectureRelationship } from '../../../backend/repository/BaseArchitectureRelationship';
import { getRepository, getRepositoryRevision } from '../../../backend/repository/RepositoryStore';
import { getRelationshipRepository, getRelationshipRepositoryRevision } from '../../../backend/repository/RelationshipRepositoryStore';

export type BaselineViewerTabProps = {
  baselineId: string;
};

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
  addedElements: BaseArchitectureElement[];
  removedElements: BaseArchitectureElement[];
  changedElements: ChangedElement[];
  addedRelationships: BaseArchitectureRelationship[];
  removedRelationships: BaseArchitectureRelationship[];
  changedRelationships: ChangedRelationship[];
};

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

const collections = [
  'enterprises',
  'capabilities',
  'businessServices',
  'businessProcesses',
  'departments',
  'applications',
  'applicationServices',
  'technologies',
  'programmes',
  'projects',
] as const;

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

const diffFields = (a: Record<string, unknown>, b: Record<string, unknown>, ignore: Set<string>) => {
  const keys = new Set<string>();
  Object.keys(a).forEach((k) => keys.add(k));
  Object.keys(b).forEach((k) => keys.add(k));

  const changed: string[] = [];
  keys.forEach((key) => {
    if (ignore.has(key)) return;
    const left = (a as any)[key];
    const right = (b as any)[key];
    if (stableStringify(left) !== stableStringify(right)) changed.push(key);
  });
  return changed.sort((x, y) => x.localeCompare(y));
};

const BaselineViewerTab: React.FC<BaselineViewerTabProps> = ({ baselineId }) => {
  const [baseline, setBaseline] = React.useState<Baseline | null>(() => getBaselineById(baselineId));
  const [comparison, setComparison] = React.useState<ComparisonResult | null>(null);
  const [compareError, setCompareError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setBaseline(getBaselineById(baselineId));
  }, [baselineId]);

  const loadCurrentSnapshot = React.useCallback(() => {
    const repo = getRepository();
    const relRepo = getRelationshipRepository();

    const elements: BaseArchitectureElement[] = [];
    collections.forEach((c) => {
      const items = repo.getElementsByType(c as any) as BaseArchitectureElement[];
      items.forEach((item) => elements.push({ ...item }));
    });

    const relationships = relRepo.getAllRelationships().map((r) => ({ ...r }));

    return {
      elements,
      relationships,
      elementsRevision: getRepositoryRevision(),
      relationshipsRevision: getRelationshipRepositoryRevision(),
    };
  }, []);

  const computeComparison = React.useCallback(() => {
    if (!baseline) {
      setComparison(null);
      return;
    }

    try {
      const current = loadCurrentSnapshot();

      const baselineById = new Map(baseline.elements.map((e) => [e.id, e]));
      const currentById = new Map(current.elements.map((e) => [e.id, e]));

      const addedElements: BaseArchitectureElement[] = [];
      const removedElements: BaseArchitectureElement[] = [];
      const changedElements: ChangedElement[] = [];

      currentById.forEach((curr, id) => {
        if (!baselineById.has(id)) {
          addedElements.push(curr);
        } else {
          const base = baselineById.get(id)!;
          const changed = diffFields(base as any, curr as any, new Set(['id']));
          if (changed.length > 0) {
            changedElements.push({
              id: curr.id,
              name: curr.name,
              elementType: curr.elementType,
              layer: (curr as any).layer ?? '',
              changedFields: changed,
            });
          }
        }
      });

      baselineById.forEach((base, id) => {
        if (!currentById.has(id)) removedElements.push(base);
      });

      const baselineRelById = new Map(baseline.relationships.map((r) => [r.id, r]));
      const currentRelById = new Map(current.relationships.map((r) => [r.id, r]));

      const addedRelationships: BaseArchitectureRelationship[] = [];
      const removedRelationships: BaseArchitectureRelationship[] = [];
      const changedRelationships: ChangedRelationship[] = [];

      currentRelById.forEach((curr, id) => {
        if (!baselineRelById.has(id)) {
          addedRelationships.push(curr);
        } else {
          const base = baselineRelById.get(id)!;
          const changed = diffFields(base as any, curr as any, new Set(['id']));
          if (changed.length > 0) {
            changedRelationships.push({
              id: curr.id,
              relationshipType: curr.relationshipType,
              summary: `${curr.sourceElementId} -> ${curr.targetElementId}`,
              changedFields: changed,
            });
          }
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
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Unable to compare against current repository.');
    }
  }, [baseline, loadCurrentSnapshot]);

  React.useEffect(() => {
    computeComparison();
  }, [computeComparison]);

  const elements = React.useMemo(() => (baseline ? [...baseline.elements] : []), [baseline]);
  const relationships = React.useMemo(() => (baseline ? [...baseline.relationships] : []), [baseline]);

  const elementTypeCounts = React.useMemo(() => {
    if (!baseline) return [] as Array<{ type: string; count: number }>;
    const counts = new Map<string, number>();
    baseline.elements.forEach((e) => {
      counts.set(e.elementType, (counts.get(e.elementType) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  }, [baseline]);

  const layerCounts = React.useMemo(() => {
    if (!baseline) return [] as Array<{ layer: string; count: number }>;
    const counts = new Map<string, number>();
    baseline.elements.forEach((e) => counts.set(e.layer, (counts.get(e.layer) ?? 0) + 1));
    return Array.from(counts.entries())
      .map(([layer, count]) => ({ layer, count }))
      .sort((a, b) => b.count - a.count || a.layer.localeCompare(b.layer));
  }, [baseline]);

  const elementColumns: ColumnsType<BaseArchitectureElement> = [
    { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: 'Type', dataIndex: 'elementType', key: 'elementType', width: 160 },
    { title: 'Layer', dataIndex: 'layer', key: 'layer', width: 120 },
    { title: 'Lifecycle', dataIndex: 'lifecycleStatus', key: 'lifecycleStatus', width: 140 },
    { title: 'Owner', dataIndex: 'ownerName', key: 'ownerName', ellipsis: true },
    { title: 'Owning unit', dataIndex: 'owningUnit', key: 'owningUnit', ellipsis: true },
  ];

  const relationshipColumns: ColumnsType<BaseArchitectureRelationship> = [
    { title: 'Type', dataIndex: 'relationshipType', key: 'relationshipType', width: 180 },
    {
      title: 'Source',
      key: 'source',
      render: (_value, record) => `${record.sourceElementId} (${record.sourceElementType})`,
      ellipsis: true,
    },
    {
      title: 'Target',
      key: 'target',
      render: (_value, record) => `${record.targetElementId} (${record.targetElementType})`,
      ellipsis: true,
    },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 120 },
    { title: 'Confidence', dataIndex: 'confidenceLevel', key: 'confidenceLevel', width: 140 },
    { title: 'Effective from', dataIndex: 'effectiveFrom', key: 'effectiveFrom', width: 200 },
  ];

  const changedElementColumns: ColumnsType<ChangedElement> = [
    { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: 'Type', dataIndex: 'elementType', key: 'elementType', width: 160 },
    { title: 'Layer', dataIndex: 'layer', key: 'layer', width: 120 },
    {
      title: 'Changed properties',
      dataIndex: 'changedFields',
      key: 'changedFields',
      render: (fields: string[]) => fields.join(', '),
    },
  ];

  const changedRelationshipColumns: ColumnsType<ChangedRelationship> = [
    { title: 'Type', dataIndex: 'relationshipType', key: 'relationshipType', width: 180 },
    { title: 'Path', dataIndex: 'summary', key: 'summary', ellipsis: true },
    {
      title: 'Changed properties',
      dataIndex: 'changedFields',
      key: 'changedFields',
      render: (fields: string[]) => fields.join(', '),
    },
  ];

  if (!baseline) {
    return (
      <div style={{ padding: 12 }}>
        <Alert
          showIcon
          type="warning"
          message="Baseline not found"
          description="The baseline id is missing or was deleted. Return to Explorer and open a valid baseline."
          style={{ marginBottom: 12 }}
        />
        <Empty description="No baseline available" />
      </div>
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          showIcon
          type="info"
          message="Viewing Baseline - Read Only"
          description="Snapshot content cannot be edited or deleted. To capture changes, return to the live repository and create a new baseline."
        />

        <Alert
          showIcon
          type="warning"
          message="Lifecycle alignment"
          description="Baselines are treated as As-Is snapshots. The current workspace represents To-Be. Lifecycle fields are never auto-updated; baselines remain descriptive and non-prescriptive."
        />

        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {baseline.name || 'Baseline'}
          </Typography.Title>
          <Typography.Text type="secondary">{baseline.description || 'No description provided.'}</Typography.Text>
        </div>

        <Card size="small" title="Snapshot metadata">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space wrap size={24}>
              <Statistic title="Elements" value={baseline.elements.length} />
              <Statistic title="Relationships" value={baseline.relationships.length} />
              <Statistic title="Element types" value={elementTypeCounts.length} />
              <Statistic title="Layers" value={layerCounts.length} />
            </Space>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Baseline id">{baseline.id}</Descriptions.Item>
              <Descriptions.Item label="Created at">{formatDateTime(baseline.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Created by">{baseline.createdBy || 'N/A'}</Descriptions.Item>
              <Descriptions.Item label="Source revisions">{`${baseline.source.elementsRevision} / ${baseline.source.relationshipsRevision}`}</Descriptions.Item>
            </Descriptions>
          </Space>
        </Card>

        <Card
          size="small"
          title="Compare with current repository"
          extra={<Button onClick={computeComparison}>Refresh</Button>}
        >
          {compareError ? (
            <Alert type="error" showIcon message={compareError} style={{ marginBottom: 12 }} />
          ) : null}
          {comparison ? (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Text type="secondary">
                Compared at {formatDateTime(comparison.comparedAt)} • Current revisions {comparison.currentElementsRevision} / {comparison.currentRelationshipsRevision}
              </Typography.Text>
              <Space wrap size={16}>
                <Statistic title="Added elements" value={comparison.addedElements.length} />
                <Statistic title="Removed elements" value={comparison.removedElements.length} />
                <Statistic title="Changed properties" value={comparison.changedElements.length} />
                <Statistic title="Added relationships" value={comparison.addedRelationships.length} />
                <Statistic title="Removed relationships" value={comparison.removedRelationships.length} />
                <Statistic title="Changed relationships" value={comparison.changedRelationships.length} />
              </Space>

              <Card size="small" title="Added elements">
                <Table
                  size="small"
                  dataSource={comparison.addedElements}
                  columns={elementColumns}
                  rowKey={(record) => record.id}
                  pagination={{ pageSize: 5, showSizeChanger: true, pageSizeOptions: [5, 10, 20] }}
                  scroll={{ x: true }}
                  locale={{ emptyText: 'No added elements' }}
                />
              </Card>

              <Card size="small" title="Removed elements">
                <Table
                  size="small"
                  dataSource={comparison.removedElements}
                  columns={elementColumns}
                  rowKey={(record) => record.id}
                  pagination={{ pageSize: 5, showSizeChanger: true, pageSizeOptions: [5, 10, 20] }}
                  scroll={{ x: true }}
                  locale={{ emptyText: 'No removed elements' }}
                />
              </Card>

              <Card size="small" title="Changed properties">
                <Table
                  size="small"
                  dataSource={comparison.changedElements}
                  columns={changedElementColumns}
                  rowKey={(record) => record.id}
                  pagination={{ pageSize: 5, showSizeChanger: true, pageSizeOptions: [5, 10, 20] }}
                  scroll={{ x: true }}
                  locale={{ emptyText: 'No property changes' }}
                />
              </Card>

              <Card size="small" title="Added relationships">
                <Table
                  size="small"
                  dataSource={comparison.addedRelationships}
                  columns={relationshipColumns}
                  rowKey={(record) => record.id}
                  pagination={{ pageSize: 5, showSizeChanger: true, pageSizeOptions: [5, 10, 20] }}
                  scroll={{ x: true }}
                  locale={{ emptyText: 'No added relationships' }}
                />
              </Card>

              <Card size="small" title="Removed relationships">
                <Table
                  size="small"
                  dataSource={comparison.removedRelationships}
                  columns={relationshipColumns}
                  rowKey={(record) => record.id}
                  pagination={{ pageSize: 5, showSizeChanger: true, pageSizeOptions: [5, 10, 20] }}
                  scroll={{ x: true }}
                  locale={{ emptyText: 'No removed relationships' }}
                />
              </Card>

              <Card size="small" title="Changed relationships">
                <Table
                  size="small"
                  dataSource={comparison.changedRelationships}
                  columns={changedRelationshipColumns}
                  rowKey={(record) => record.id}
                  pagination={{ pageSize: 5, showSizeChanger: true, pageSizeOptions: [5, 10, 20] }}
                  scroll={{ x: true }}
                  locale={{ emptyText: 'No relationship changes' }}
                />
              </Card>
            </Space>
          ) : (
            <Typography.Text type="secondary">No comparison available.</Typography.Text>
          )}
        </Card>

        <Card size="small" title="Element mix">
          <Space wrap size={8}>
            {elementTypeCounts.length === 0 ? (
              <Typography.Text type="secondary">No elements captured.</Typography.Text>
            ) : (
              elementTypeCounts.map((item) => (
                <Tag key={item.type}>{`${item.type}: ${item.count}`}</Tag>
              ))
            )}
          </Space>
          <Space wrap size={8} style={{ marginTop: 12 }}>
            {layerCounts.length === 0 ? (
              <Typography.Text type="secondary">No layers captured.</Typography.Text>
            ) : (
              layerCounts.map((item) => (
                <Tag key={item.layer} color="blue">{`${item.layer}: ${item.count}`}</Tag>
              ))
            )}
          </Space>
        </Card>

        <Card size="small" title="Elements (read-only)">
          <Table
            size="small"
            columns={elementColumns}
            dataSource={elements}
            rowKey={(record) => record.id}
            pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
            scroll={{ x: true }}
          />
        </Card>

        <Card size="small" title="Relationships (read-only)">
          <Table
            size="small"
            columns={relationshipColumns}
            dataSource={relationships}
            rowKey={(record) => record.id}
            pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
            scroll={{ x: true }}
          />
        </Card>
      </Space>
    </div>
  );
};

export default BaselineViewerTab;
