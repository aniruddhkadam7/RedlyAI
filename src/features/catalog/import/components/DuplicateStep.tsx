// ─── Duplicate Resolution Step ────────────────────────────────────────────
// Side-by-side duplicate preview with strategy selection.

import { Button, Select, Table, Tag, Typography } from 'antd';
import React from 'react';
import styles from '../import.module.less';
import type {
  DuplicateMatch,
  DuplicateStrategy,
  ImportRecord,
} from '../types/import.types';

type DuplicateStepProps = {
  duplicateRecords: ImportRecord[];
  duplicateMatches: DuplicateMatch[];
  onUpdateStrategy: (rowIndex: number, strategy: DuplicateStrategy) => void;
  onProceed: () => void;
  onBack: () => void;
};

const STRATEGY_OPTIONS = [
  { value: 'UPDATE_EXISTING', label: 'Update Existing' },
  { value: 'CREATE_NEW', label: 'Create New' },
  { value: 'SKIP', label: 'Skip' },
];

const DuplicateStep: React.FC<DuplicateStepProps> = ({
  duplicateRecords,
  duplicateMatches,
  onUpdateStrategy,
  onProceed,
  onBack,
}) => {
  const matchIndex = React.useMemo(() => {
    const map = new Map<number, DuplicateMatch>();
    for (const m of duplicateMatches) {
      map.set(m.importRowIndex, m);
    }
    return map;
  }, [duplicateMatches]);

  const columns = [
    {
      title: 'Row',
      dataIndex: 'rowIndex',
      key: 'rowIndex',
      width: 60,
    },
    {
      title: 'Import Name',
      key: 'importName',
      width: 200,
      render: (_: unknown, record: ImportRecord) =>
        String(record.mapped?.name ?? ''),
    },
    {
      title: 'Existing Name',
      key: 'existingName',
      width: 200,
      render: (_: unknown, record: ImportRecord) => {
        const match = matchIndex.get(record.rowIndex);
        return match ? (
          <Typography.Text type="secondary">
            {match.existingElementName}
          </Typography.Text>
        ) : (
          '—'
        );
      },
    },
    {
      title: 'Matched By',
      key: 'matchedBy',
      width: 130,
      render: (_: unknown, record: ImportRecord) => {
        const match = matchIndex.get(record.rowIndex);
        return match ? (
          <Tag color={match.matchedBy === 'applicationCode' ? 'blue' : 'cyan'}>
            {match.matchedBy === 'applicationCode' ? 'App Code' : 'Name'}
          </Tag>
        ) : (
          '—'
        );
      },
    },
    {
      title: 'Action',
      key: 'strategy',
      width: 180,
      render: (_: unknown, record: ImportRecord) => (
        <Select
          value={record.duplicateStrategy ?? 'UPDATE_EXISTING'}
          style={{ width: '100%' }}
          options={STRATEGY_OPTIONS}
          onChange={(value) =>
            onUpdateStrategy(record.rowIndex, value as DuplicateStrategy)
          }
        />
      ),
    },
  ];

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <Typography.Title level={5}>Duplicate Resolution</Typography.Title>
        <Typography.Text type="secondary">
          {duplicateRecords.length} duplicate(s) detected. Choose how to handle
          each one.
        </Typography.Text>
      </div>

      <Table
        dataSource={duplicateRecords}
        columns={columns}
        rowKey="rowIndex"
        size="small"
        pagination={duplicateRecords.length > 50 ? { pageSize: 50 } : false}
        scroll={{ y: 400 }}
      />

      <div className={styles.stepActions}>
        <Button onClick={onBack}>Back</Button>
        <Button type="primary" onClick={onProceed}>
          Proceed to Import
        </Button>
      </div>
    </div>
  );
};

export default DuplicateStep;
