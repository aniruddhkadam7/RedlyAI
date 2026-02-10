import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Space,
  Table,
  Typography,
  theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import React from 'react';

import type { AnalysisKind } from '@/analysis/analysisResultsStore';
import { getAnalysisResult } from '@/analysis/analysisResultsStore';
import { getImpactExplanation } from '@/services/ea/impact';
import { useAppTheme } from '@/theme/ThemeContext';
import type { ImpactAnalysisRequest } from '../../../backend/analysis/ImpactAnalysisRequest';
import type { ImpactRankedElement } from '../../../backend/analysis/ImpactRanking';
import type { ImpactSummary } from '../../../backend/analysis/ImpactSummary';

export type ImpactAnalysisResultData = {
  request: ImpactAnalysisRequest;
  summary: ImpactSummary;
  rankedImpacts: ImpactRankedElement[];
  impactPathsCount?: number;
  audit?: {
    auditId: string;
    requestId: string;
    ranBy: string;
    ranAt: string;
    direction: string;
    maxDepth: number;
    includedRelationshipTypes: readonly string[];
  };
  // Optional snapshot to render stable names at time-of-run.
  elementIndex?: Array<{ id: string; name: string; elementType: string }>;
};

export type DependencyAnalysisResultData = {
  rootElementId: string;
  direction: 'Downstream' | 'Upstream';
  maxDepth: number;
  reachableCount: number;
  edgesConsidered: number;
  topOutgoing: Array<{ elementId: string; count: number }>;
  topIncoming: Array<{ elementId: string; count: number }>;
  elementIndex?: Array<{ id: string; name: string; elementType: string }>;
};

export type CoverageAnalysisResultData = {
  elementCountsByType: Array<{ elementType: string; count: number }>;
  relationshipCountsByType: Array<{ relationshipType: string; count: number }>;
  orphanedElementCount: number;
  totalElementCount: number;
  totalRelationshipCount: number;
};

const nameFor = (
  id: string,
  idx: ReadonlyMap<string, { id: string; name: string; elementType: string }>,
): { title: string; subtitle: string } => {
  const e = idx.get(id);
  if (!e) return { title: id, subtitle: 'Unknown' };
  return { title: e.name || e.id, subtitle: `${e.elementType} · ${e.id}` };
};

const ImpactResultView: React.FC<{ data: ImpactAnalysisResultData }> = ({
  data,
}) => {
  const [selectedElementId, setSelectedElementId] = React.useState<
    string | null
  >(null);
  const [loadingExplanation, setLoadingExplanation] = React.useState(false);
  const [explanation, setExplanation] = React.useState<{
    explanationText: string;
    selectionPolicy: string;
    representativePathLength: number;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const elementIndex = React.useMemo(() => {
    const entries = (data.elementIndex ?? []).map((e) => [e.id, e] as const);
    return new Map(entries);
  }, [data.elementIndex]);

  const columns: ColumnsType<ImpactRankedElement> = [
    {
      title: 'Score',
      width: 90,
      render: (_: unknown, row) => row.score?.computedScore ?? 0,
    },
    {
      title: 'Severity',
      width: 110,
      render: (_: unknown, row) => row.score?.severityLabel ?? 'Low',
    },
    {
      title: 'Element',
      render: (_: unknown, row) => {
        const label = nameFor(row.elementId, elementIndex);
        return (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{label.title}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {label.subtitle}
            </Typography.Text>
          </Space>
        );
      },
    },
    {
      title: 'Paths',
      width: 90,
      render: (_: unknown, row) => row.evidence.totalPathsAffectingElement,
    },
    {
      title: 'Hard',
      width: 80,
      render: (_: unknown, row) => row.evidence.hardPathCount,
    },
    {
      title: 'Soft-only',
      width: 100,
      render: (_: unknown, row) => row.evidence.softOnlyPathCount,
    },
    {
      title: 'Max depth',
      width: 110,
      render: (_: unknown, row) => row.evidence.maxDepthObserved,
    },
    {
      title: 'Explain',
      width: 120,
      render: (_: unknown, row) => (
        <Button
          size="small"
          onClick={async () => {
            setSelectedElementId(row.elementId);
            setLoadingExplanation(true);
            setError(null);
            setExplanation(null);
            try {
              const resp = await getImpactExplanation({
                rootId: data.request.rootElementId,
                elementId: row.elementId,
                direction: data.request.direction,
                maxDepth: data.request.maxDepth,
                relationshipTypes: data.request.includedRelationshipTypes,
              });

              if (!resp?.success)
                throw new Error(resp?.errorMessage || 'Explanation not found.');
              if (!resp.data.ok) throw new Error(resp.data.error);

              setExplanation({
                explanationText: resp.data.explanationText,
                selectionPolicy: resp.data.selectionPolicy,
                representativePathLength:
                  resp.data.representativePath.pathLength,
              });
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : 'Failed to retrieve explanation.',
              );
            } finally {
              setLoadingExplanation(false);
            }
          }}
        >
          Explain
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 12 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        Impact Analysis Result
      </Typography.Title>

      <Alert
        type="info"
        showIcon
        message="Read-only result"
        description="This tab is a snapshot of a completed analysis run. It does not mutate repository data."
      />

      <Divider style={{ margin: '12px 0' }} />

      <Card size="small" title="Run Metadata">
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="Request ID">
            {data.request.requestId}
          </Descriptions.Item>
          <Descriptions.Item label="Requested At">
            {data.request.requestedAt}
          </Descriptions.Item>
          <Descriptions.Item label="Requested By">
            {data.request.requestedBy}
          </Descriptions.Item>
          <Descriptions.Item label="Repository">
            {data.request.repositoryName ? data.request.repositoryName : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Root Element ID">
            {data.request.rootElementId}
          </Descriptions.Item>
          <Descriptions.Item label="Direction">
            {data.request.direction}
          </Descriptions.Item>
          <Descriptions.Item label="Max Depth">
            {data.request.maxDepth}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Divider style={{ margin: '12px 0' }} />

      <Card size="small" title="Summary">
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="Total impacted">
            {data.summary.totalImpactedElements}
          </Descriptions.Item>
          <Descriptions.Item label="Max dependency depth">
            {data.summary.maxDependencyDepthObserved}
          </Descriptions.Item>
          <Descriptions.Item label="Severity (High)">
            {data.summary.severityBreakdown?.High ?? 0}
          </Descriptions.Item>
          <Descriptions.Item label="Severity (Medium)">
            {data.summary.severityBreakdown?.Medium ?? 0}
          </Descriptions.Item>
          <Descriptions.Item label="Severity (Low)">
            {data.summary.severityBreakdown?.Low ?? 0}
          </Descriptions.Item>
          <Descriptions.Item label="Paths (included)">
            {typeof data.impactPathsCount === 'number'
              ? data.impactPathsCount
              : 'Not requested'}
          </Descriptions.Item>
          <Descriptions.Item label="Relationship types">
            {(data.request.includedRelationshipTypes ?? []).join(', ') || '—'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Divider style={{ margin: '12px 0' }} />

      <Card size="small" title="Ranked Impacts">
        <Table
          size="small"
          rowKey={(r) => r.elementId}
          columns={columns}
          dataSource={data.rankedImpacts}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Divider style={{ margin: '12px 0' }} />

      <Card
        size="small"
        title={
          selectedElementId
            ? `Explanation: ${selectedElementId}`
            : 'Explanation'
        }
        extra={
          loadingExplanation ? (
            <Typography.Text type="secondary">Loading…</Typography.Text>
          ) : null
        }
      >
        {error ? <Alert type="error" showIcon message={error} /> : null}
        {!error && !explanation ? (
          <Typography.Text type="secondary">
            Select “Explain” on a ranked element.
          </Typography.Text>
        ) : null}
        {explanation ? (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Selection policy">
                {explanation.selectionPolicy}
              </Descriptions.Item>
              <Descriptions.Item label="Path length">
                {explanation.representativePathLength}
              </Descriptions.Item>
            </Descriptions>
            <Card size="small" type="inner" title="Explanation">
              <Typography.Paragraph
                style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}
              >
                {explanation.explanationText}
              </Typography.Paragraph>
            </Card>
          </Space>
        ) : null}
      </Card>
    </div>
  );
};

const DependencyResultView: React.FC<{
  data: DependencyAnalysisResultData;
}> = ({ data }) => {
  const elementIndex = React.useMemo(() => {
    const entries = (data.elementIndex ?? []).map((e) => [e.id, e] as const);
    return new Map(entries);
  }, [data.elementIndex]);

  const columns: ColumnsType<{ elementId: string; count: number }> = [
    {
      title: 'Element',
      render: (_: unknown, row) => {
        const label = nameFor(row.elementId, elementIndex);
        return (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{label.title}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {label.subtitle}
            </Typography.Text>
          </Space>
        );
      },
    },
    { title: 'Count', dataIndex: 'count', width: 120 },
  ];

  return (
    <div style={{ padding: 12 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        Dependency Analysis Result
      </Typography.Title>

      <Alert
        type="info"
        showIcon
        message="Read-only result"
        description="Computed from repository elements and relationships only."
      />

      <Divider style={{ margin: '12px 0' }} />

      <Card size="small" title="Scope">
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="Root element">
            {data.rootElementId}
          </Descriptions.Item>
          <Descriptions.Item label="Direction">
            {data.direction}
          </Descriptions.Item>
          <Descriptions.Item label="Max depth">
            {data.maxDepth}
          </Descriptions.Item>
          <Descriptions.Item label="Edges considered">
            {data.edgesConsidered}
          </Descriptions.Item>
          <Descriptions.Item label="Reachable elements">
            {data.reachableCount}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Divider style={{ margin: '12px 0' }} />

      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Card size="small" title="Top Outgoing (highest out-degree)">
          <Table
            size="small"
            rowKey={(r) => r.elementId}
            columns={columns}
            dataSource={data.topOutgoing}
            pagination={false}
          />
        </Card>

        <Card size="small" title="Top Incoming (most depended-on)">
          <Table
            size="small"
            rowKey={(r) => r.elementId}
            columns={columns}
            dataSource={data.topIncoming}
            pagination={false}
          />
        </Card>
      </Space>
    </div>
  );
};

const CoverageResultView: React.FC<{ data: CoverageAnalysisResultData }> = ({
  data,
}) => {
  return (
    <div style={{ padding: 12 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        Coverage Analysis Result
      </Typography.Title>

      <Alert
        type="info"
        showIcon
        message="Read-only result"
        description="Summarizes repository coverage (counts + connectivity)."
      />

      <Divider style={{ margin: '12px 0' }} />

      <Card size="small" title="Totals">
        <Descriptions size="small" column={3} bordered>
          <Descriptions.Item label="Elements">
            {data.totalElementCount}
          </Descriptions.Item>
          <Descriptions.Item label="Relationships">
            {data.totalRelationshipCount}
          </Descriptions.Item>
          <Descriptions.Item label="Orphaned elements">
            {data.orphanedElementCount}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Divider style={{ margin: '12px 0' }} />

      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Card size="small" title="Elements by Type">
          <Table
            size="small"
            rowKey={(r) => r.elementType}
            pagination={false}
            columns={[
              { title: 'Type', dataIndex: 'elementType' },
              { title: 'Count', dataIndex: 'count', width: 160 },
            ]}
            dataSource={data.elementCountsByType}
          />
        </Card>

        <Card size="small" title="Relationships by Type">
          <Table
            size="small"
            rowKey={(r) => r.relationshipType}
            pagination={false}
            columns={[
              { title: 'Type', dataIndex: 'relationshipType' },
              { title: 'Count', dataIndex: 'count', width: 160 },
            ]}
            dataSource={data.relationshipCountsByType}
          />
        </Card>
      </Space>
    </div>
  );
};

const AnalysisResultTab: React.FC<{ resultId: string }> = ({ resultId }) => {
  const record = getAnalysisResult(resultId);
  const { token } = theme.useToken();
  const { isDark } = useAppTheme();

  const borderColor = token.colorBorder;
  const headerBg = isDark ? token.colorBgElevated : token.colorFillQuaternary;
  const sectionBg = isDark ? token.colorBgElevated : token.colorFillQuaternary;

  const tableStyle = React.useMemo(
    () => `
    .analysis-result-grid .ant-table-thead > tr > th {
      border-bottom: 2px solid ${borderColor} !important;
      background: ${headerBg} !important;
    }
    .analysis-result-grid .ant-table-tbody > tr > td {
      border-bottom: 1px solid ${borderColor} !important;
      border-right: 1px solid ${token.colorBorderSecondary} !important;
    }
    .analysis-result-grid .ant-table-tbody > tr > td:last-child {
      border-right: none !important;
    }
    .analysis-result-grid .ant-table-thead > tr > th {
      border-right: 1px solid ${token.colorBorderSecondary} !important;
    }
    .analysis-result-grid .ant-table-thead > tr > th:last-child {
      border-right: none !important;
    }
    .analysis-result-grid .ant-card {
      border-color: ${borderColor} !important;
    }
    .analysis-result-grid .ant-card-head {
      background: ${sectionBg} !important;
    }
  `,
    [borderColor, headerBg, sectionBg, token.colorBorderSecondary],
  );

  if (!record) {
    return (
      <div style={{ padding: 12 }}>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Analysis Result
        </Typography.Title>
        <Alert
          type="warning"
          showIcon
          message="Result not found"
          description="This result is not available (it may have been evicted from the in-memory store). Re-run the analysis."
        />
      </div>
    );
  }

  if (record.kind === 'impact') {
    return (
      <div className="analysis-result-grid">
        <style>{tableStyle}</style>
        <ImpactResultView data={record.data as ImpactAnalysisResultData} />
      </div>
    );
  }

  if (record.kind === 'dependency') {
    return (
      <div className="analysis-result-grid">
        <style>{tableStyle}</style>
        <DependencyResultView
          data={record.data as DependencyAnalysisResultData}
        />
      </div>
    );
  }

  return (
    <div className="analysis-result-grid">
      <style>{tableStyle}</style>
      <CoverageResultView data={record.data as CoverageAnalysisResultData} />
    </div>
  );
};

export default AnalysisResultTab;
export type { AnalysisKind };
