// ─── Mapping Step ─────────────────────────────────────────────────────────
// Column mapping UI: CSV headers → Application attributes.

import { CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { Alert, Button, Select, Table, Tag, Typography } from 'antd';
import React from 'react';
import styles from '../import.module.less';
import type { ColumnMapping, TargetField } from '../types/import.types';

type MappingStepProps = {
  csvHeaders: string[];
  csvPreview: Record<string, string>[];
  mappings: ColumnMapping[];
  targetFields: TargetField[];
  totalRows: number;
  loading: boolean;
  error: string | null;
  onUpdateMapping: (csvHeader: string, targetField: string) => void;
  onConfirm: () => void;
  onBack: () => void;
};

const MappingStep: React.FC<MappingStepProps> = ({
  csvHeaders: _csvHeaders,
  csvPreview,
  mappings,
  targetFields,
  totalRows,
  loading,
  error,
  onUpdateMapping,
  onConfirm,
  onBack,
}) => {
  const requiredFields = targetFields.filter((f) => f.required);
  const mappedTargets = new Set(
    mappings.map((m) => m.targetField).filter(Boolean),
  );
  const missingRequired = requiredFields.filter(
    (f) => !mappedTargets.has(f.key),
  );

  const columns = [
    {
      title: 'CSV Column',
      dataIndex: 'csvHeader',
      key: 'csvHeader',
      width: 200,
      render: (text: string) => <Typography.Text code>{text}</Typography.Text>,
    },
    {
      title: 'Sample Value',
      key: 'sample',
      width: 200,
      render: (_: unknown, record: ColumnMapping) => {
        const sample = csvPreview[0]?.[record.csvHeader] ?? '';
        return (
          <Typography.Text type="secondary" ellipsis>
            {sample || '(empty)'}
          </Typography.Text>
        );
      },
    },
    {
      title: 'Maps To',
      key: 'targetField',
      width: 260,
      render: (_: unknown, record: ColumnMapping) => (
        <Select
          value={record.targetField || undefined}
          placeholder="— Ignore —"
          allowClear
          style={{ width: '100%' }}
          onChange={(value) => onUpdateMapping(record.csvHeader, value ?? '')}
          options={[
            ...targetFields.map((f) => ({
              value: f.key,
              label: (
                <span>
                  {f.label}{' '}
                  {f.required && (
                    <Tag color="red" style={{ marginLeft: 4, fontSize: 10 }}>
                      Required
                    </Tag>
                  )}
                </span>
              ),
              disabled:
                mappedTargets.has(f.key) && record.targetField !== f.key,
            })),
          ]}
        />
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 100,
      render: (_: unknown, record: ColumnMapping) => {
        if (!record.targetField) {
          return <Tag>Ignored</Tag>;
        }
        const field = targetFields.find((f) => f.key === record.targetField);
        return field?.required ? (
          <Tag color="green" icon={<CheckCircleOutlined />}>
            Required
          </Tag>
        ) : (
          <Tag color="blue" icon={<CheckCircleOutlined />}>
            Mapped
          </Tag>
        );
      },
    },
  ];

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <Typography.Title level={5}>Column Mapping</Typography.Title>
        <Typography.Text type="secondary">
          Map CSV columns to application attributes. {totalRows} rows detected.
        </Typography.Text>
      </div>

      {missingRequired.length > 0 && (
        <Alert
          type="warning"
          icon={<WarningOutlined />}
          showIcon
          message={`Missing required mappings: ${missingRequired.map((f) => f.label).join(', ')}`}
          className={styles.stepAlert}
        />
      )}

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          className={styles.stepAlert}
        />
      )}

      <Table
        dataSource={mappings}
        columns={columns}
        rowKey="csvHeader"
        pagination={false}
        size="small"
        className={styles.mappingTable}
      />

      <div className={styles.stepActions}>
        <Button onClick={onBack}>Back</Button>
        <Button
          type="primary"
          onClick={onConfirm}
          loading={loading}
          disabled={loading || missingRequired.length > 0}
        >
          Validate Data
        </Button>
      </div>
    </div>
  );
};

export default MappingStep;
