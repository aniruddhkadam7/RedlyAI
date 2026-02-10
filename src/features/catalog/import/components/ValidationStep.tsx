// ─── Validation Step ──────────────────────────────────────────────────────
// Shows validation results with valid/invalid/duplicate breakdowns.

import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Alert, Button, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import React from 'react';
import styles from '../import.module.less';
import type { FieldValidationError, ImportRecord } from '../types/import.types';

type ValidationStepProps = {
  validRecords: ImportRecord[];
  invalidRecords: ImportRecord[];
  duplicateRecords: ImportRecord[];
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  error: string | null;
  onProceed: () => void;
  onBack: () => void;
};

const ValidationStep: React.FC<ValidationStepProps> = ({
  validRecords,
  invalidRecords,
  duplicateRecords,
  validCount,
  invalidCount,
  duplicateCount,
  error,
  onProceed,
  onBack,
}) => {
  const errorColumns = [
    {
      title: 'Row',
      dataIndex: 'row',
      key: 'row',
      width: 70,
    },
    {
      title: 'Field',
      dataIndex: 'field',
      key: 'field',
      width: 140,
    },
    {
      title: 'Value',
      dataIndex: 'value',
      key: 'value',
      width: 160,
      render: (text: string) => (
        <Typography.Text type="secondary" ellipsis>
          {text || '(empty)'}
        </Typography.Text>
      ),
    },
    {
      title: 'Error',
      dataIndex: 'message',
      key: 'message',
      render: (text: string) => (
        <Typography.Text type="danger">{text}</Typography.Text>
      ),
    },
  ];

  const validColumns = [
    {
      title: 'Row',
      dataIndex: 'rowIndex',
      key: 'rowIndex',
      width: 70,
    },
    {
      title: 'Name',
      key: 'name',
      render: (_: unknown, record: ImportRecord) =>
        String(record.mapped?.name ?? ''),
    },
    {
      title: 'Type',
      key: 'type',
      render: (_: unknown, record: ImportRecord) =>
        String(record.mapped?.applicationType ?? 'Custom'),
    },
    {
      title: 'Lifecycle',
      key: 'lifecycle',
      render: (_: unknown, record: ImportRecord) =>
        String(record.mapped?.lifecycleStatus ?? 'Active'),
    },
    {
      title: 'Status',
      key: 'status',
      width: 100,
      render: (_: unknown, record: ImportRecord) => (
        <Tag
          color={
            record.status === 'VALID'
              ? 'green'
              : record.status === 'DUPLICATE'
                ? 'orange'
                : 'red'
          }
        >
          {record.status}
        </Tag>
      ),
    },
  ];

  // Flatten all errors from invalid records for the error table.
  const allErrors: FieldValidationError[] = invalidRecords.flatMap(
    (r) => r.errors,
  );

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <Typography.Title level={5}>Validation Results</Typography.Title>
      </div>

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          className={styles.stepAlert}
        />
      )}

      <div className={styles.statsRow}>
        <Statistic
          title="Valid"
          value={validCount}
          prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
        />
        <Statistic
          title="Invalid"
          value={invalidCount}
          prefix={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
        />
        <Statistic
          title="Duplicates"
          value={duplicateCount}
          prefix={<ExclamationCircleOutlined style={{ color: '#faad14' }} />}
        />
      </div>

      <Tabs
        defaultActiveKey="valid"
        items={[
          {
            key: 'valid',
            label: `Valid (${validCount})`,
            children: (
              <Table
                dataSource={validRecords.slice(0, 100)}
                columns={validColumns}
                rowKey="rowIndex"
                size="small"
                pagination={validCount > 100 ? { pageSize: 50 } : false}
                scroll={{ y: 300 }}
              />
            ),
          },
          {
            key: 'invalid',
            label: (
              <span>
                Invalid ({invalidCount}){' '}
                {invalidCount > 0 && (
                  <WarningOutlined style={{ color: '#ff4d4f' }} />
                )}
              </span>
            ),
            children: (
              <Table
                dataSource={allErrors}
                columns={errorColumns}
                rowKey={(record, index) =>
                  `${record.row}-${record.field}-${index}`
                }
                size="small"
                pagination={allErrors.length > 50 ? { pageSize: 50 } : false}
                scroll={{ y: 300 }}
              />
            ),
          },
          {
            key: 'duplicate',
            label: `Duplicates (${duplicateCount})`,
            children: (
              <Table
                dataSource={duplicateRecords.slice(0, 100)}
                columns={validColumns}
                rowKey="rowIndex"
                size="small"
                pagination={duplicateCount > 100 ? { pageSize: 50 } : false}
                scroll={{ y: 300 }}
              />
            ),
          },
        ]}
      />

      <div className={styles.stepActions}>
        <Button onClick={onBack}>Back</Button>
        <Button
          type="primary"
          onClick={onProceed}
          disabled={validCount === 0 && duplicateCount === 0}
        >
          {duplicateCount > 0 ? 'Review Duplicates' : 'Proceed to Import'}
        </Button>
      </div>
    </div>
  );
};

export default ValidationStep;
