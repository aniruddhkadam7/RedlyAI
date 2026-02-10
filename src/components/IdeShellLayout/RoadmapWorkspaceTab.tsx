import { Alert, Table, Typography, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import React from 'react';

import { useEaRepository } from '@/ea/EaRepositoryContext';
import { isRoadmapAllowedForLifecycleCoverage } from '@/repository/lifecycleCoveragePolicy';
import { isRoadmapItemInTimeHorizon } from '@/repository/timeHorizonPolicy';
import { useAppTheme } from '@/theme/ThemeContext';

type RoadmapRow = {
  key: string;
  type: 'Programme' | 'Project';
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  lifecycleStatus?: string;
};

const toIsoLikeString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const toDisplayDate = (value: string | undefined): string => {
  if (!value) return '—';
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return value;
  return new Date(t).toLocaleDateString();
};

const RoadmapWorkspaceTab: React.FC = () => {
  const { eaRepository, metadata } = useEaRepository();
  const { token } = theme.useToken();
  const { isDark } = useAppTheme();

  const borderColor = token.colorBorder;
  const headerBg = isDark ? token.colorBgElevated : token.colorFillQuaternary;

  const data = React.useMemo<RoadmapRow[]>(() => {
    if (!eaRepository) return [];
    const nowMs = Date.now();

    const rows: RoadmapRow[] = [];
    for (const obj of eaRepository.objects.values()) {
      if (obj.type !== 'Programme' && obj.type !== 'Project') continue;

      const nameAttr =
        typeof obj.attributes?.name === 'string'
          ? obj.attributes.name.trim()
          : '';
      const name = nameAttr || obj.id;

      const startDate =
        toIsoLikeString(obj.attributes?.startDate) ??
        toIsoLikeString(obj.attributes?.lifecycleStartDate) ??
        undefined;

      const endDate =
        toIsoLikeString(obj.attributes?.endDate) ??
        toIsoLikeString(obj.attributes?.lifecycleEndDate) ??
        undefined;

      const lifecycleStatus =
        typeof obj.attributes?.lifecycleStatus === 'string'
          ? obj.attributes.lifecycleStatus
          : undefined;

      if (
        !isRoadmapItemInTimeHorizon({
          timeHorizon: metadata?.timeHorizon,
          nowMs,
          startDate,
          endDate,
          lifecycleStatus,
        })
      ) {
        continue;
      }

      rows.push({
        key: `${obj.type}:${obj.id}`,
        type: obj.type,
        id: obj.id,
        name,
        startDate,
        endDate,
        lifecycleStatus,
      });
    }

    const compare = (a: RoadmapRow, b: RoadmapRow) => {
      const at = a.startDate ? Date.parse(a.startDate) : NaN;
      const bt = b.startDate ? Date.parse(b.startDate) : NaN;
      const aHas = Number.isFinite(at);
      const bHas = Number.isFinite(bt);
      if (aHas && bHas && at !== bt) return at - bt;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    };

    return rows.sort(compare);
  }, [eaRepository, metadata?.timeHorizon]);

  const columns = React.useMemo<ColumnsType<RoadmapRow>>(
    () => [
      { title: 'Type', dataIndex: 'type', width: 120 },
      { title: 'Name', dataIndex: 'name', width: 260 },
      { title: 'ID', dataIndex: 'id', width: 240 },
      {
        title: 'Start',
        dataIndex: 'startDate',
        width: 140,
        render: (v: RoadmapRow['startDate']) => toDisplayDate(v),
      },
      {
        title: 'End',
        dataIndex: 'endDate',
        width: 140,
        render: (v: RoadmapRow['endDate']) => toDisplayDate(v),
      },
      {
        title: 'Lifecycle',
        dataIndex: 'lifecycleStatus',
        width: 140,
        render: (v) => v ?? '—',
      },
    ],
    [],
  );

  if (!isRoadmapAllowedForLifecycleCoverage(metadata?.lifecycleCoverage)) {
    return (
      <div style={{ padding: 12 }}>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Roadmap
        </Typography.Title>

        <Alert
          type="warning"
          showIcon
          message="Roadmap is hidden in As-Is Lifecycle Coverage"
          description="Change Lifecycle Coverage to 'To-Be' or 'Both' to view and manage Roadmap items."
        />
      </div>
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        Roadmap
      </Typography.Title>

      <Alert
        type="info"
        showIcon
        message="Implementation & Migration roadmap"
        description="Summarizes Programmes and Projects from the repository and orders them by start date when available."
        style={{ marginBottom: 12 }}
      />

      <style>{`
        .roadmap-ws-grid .ant-table-thead > tr > th {
          border-bottom: 2px solid ${borderColor} !important;
          background: ${headerBg} !important;
        }
        .roadmap-ws-grid .ant-table-tbody > tr > td {
          border-bottom: 1px solid ${borderColor} !important;
          border-right: 1px solid ${token.colorBorderSecondary} !important;
        }
        .roadmap-ws-grid .ant-table-tbody > tr > td:last-child {
          border-right: none !important;
        }
        .roadmap-ws-grid .ant-table-thead > tr > th {
          border-right: 1px solid ${token.colorBorderSecondary} !important;
        }
        .roadmap-ws-grid .ant-table-thead > tr > th:last-child {
          border-right: none !important;
        }
      `}</style>
      <div className="roadmap-ws-grid">
        <Table<RoadmapRow>
          size="small"
          rowKey="key"
          dataSource={data}
          columns={columns}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          scroll={{ x: 900 }}
        />
      </div>
    </div>
  );
};

export default RoadmapWorkspaceTab;
