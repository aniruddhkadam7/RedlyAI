// ─── Summary Step ─────────────────────────────────────────────────────────
// Pre-import summary + execute + result display.

import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { Alert, Button, Progress, Result, Statistic, Typography } from 'antd';
import React from 'react';
import styles from '../import.module.less';
import type { ImportBatch, ImportRecord } from '../types/import.types';

type SummaryStepProps = {
  validCount: number;
  invalidCount: number;
  duplicateRecords: ImportRecord[];
  loading: boolean;
  error: string | null;
  importResult: ImportBatch | null;
  onExecute: () => void;
  onBack: () => void;
  onReset: () => void;
  onGoToCatalog: () => void;
};

const SummaryStep: React.FC<SummaryStepProps> = ({
  validCount,
  invalidCount,
  duplicateRecords,
  loading,
  error,
  importResult,
  onExecute,
  onBack,
  onReset,
  onGoToCatalog,
}) => {
  const skipCount = duplicateRecords.filter(
    (r) => r.duplicateStrategy === 'SKIP',
  ).length;
  const updateCount = duplicateRecords.filter(
    (r) => (r.duplicateStrategy ?? 'UPDATE_EXISTING') === 'UPDATE_EXISTING',
  ).length;
  const createNewCount = duplicateRecords.filter(
    (r) => r.duplicateStrategy === 'CREATE_NEW',
  ).length;
  const totalToProcess = validCount + updateCount + createNewCount;

  const downloadErrorReport = React.useCallback(() => {
    if (!importResult?.errorReport?.length) return;
    const headers = ['Row', 'Field', 'Value', 'Error'];
    const lines = [headers.join(',')];
    for (const err of importResult.errorReport) {
      lines.push(
        [
          err.row,
          err.field,
          `"${String(err.value).replace(/"/g, '""')}"`,
          `"${err.message.replace(/"/g, '""')}"`,
        ].join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `import-errors-${importResult.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [importResult]);

  // ─── Post-Import Result ─────────────────────────────────────────────

  if (importResult) {
    const success = importResult.status === 'COMPLETED';
    const percent = Math.round(
      (importResult.successCount / Math.max(importResult.totalRecords, 1)) *
        100,
    );

    return (
      <div className={styles.stepContent}>
        <Result
          status={success ? 'success' : 'warning'}
          title={success ? 'Import Complete' : 'Import Completed with Errors'}
          subTitle={`Batch ${importResult.id.slice(0, 8)}`}
        />

        <div className={styles.statsRow}>
          <Statistic
            title="Imported"
            value={importResult.successCount}
            prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
          />
          <Statistic
            title="Failed"
            value={importResult.failureCount}
            prefix={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
          />
          <Statistic
            title="Skipped"
            value={importResult.skippedCount}
            prefix={<ExclamationCircleOutlined style={{ color: '#faad14' }} />}
          />
        </div>

        <Progress
          percent={percent}
          status={success ? 'success' : 'exception'}
        />

        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            className={styles.stepAlert}
          />
        )}

        {importResult.errorReport && importResult.errorReport.length > 0 && (
          <Alert
            type="warning"
            showIcon
            message={`${importResult.errorReport.length} error(s) occurred during import.`}
            action={
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={downloadErrorReport}
              >
                Download Error Report
              </Button>
            }
            className={styles.stepAlert}
          />
        )}

        <div className={styles.stepActions}>
          <Button onClick={onReset}>Import Another File</Button>
          <Button type="primary" onClick={onGoToCatalog}>
            Go to Catalog
          </Button>
        </div>
      </div>
    );
  }

  // ─── Pre-Import Summary ─────────────────────────────────────────────

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <Typography.Title level={5}>Import Summary</Typography.Title>
        <Typography.Text type="secondary">
          Review the summary below and click "Run Import" to proceed.
        </Typography.Text>
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

      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <Typography.Text type="secondary">New Records</Typography.Text>
          <Typography.Title level={3}>{validCount}</Typography.Title>
        </div>
        <div className={styles.summaryCard}>
          <Typography.Text type="secondary">Updates</Typography.Text>
          <Typography.Title level={3}>{updateCount}</Typography.Title>
        </div>
        <div className={styles.summaryCard}>
          <Typography.Text type="secondary">Create as New</Typography.Text>
          <Typography.Title level={3}>{createNewCount}</Typography.Title>
        </div>
        <div className={styles.summaryCard}>
          <Typography.Text type="secondary">Skipped</Typography.Text>
          <Typography.Title level={3}>{skipCount}</Typography.Title>
        </div>
        <div className={styles.summaryCard}>
          <Typography.Text type="secondary">Invalid (excluded)</Typography.Text>
          <Typography.Title level={3} type="danger">
            {invalidCount}
          </Typography.Title>
        </div>
        <div className={styles.summaryCard}>
          <Typography.Text strong>Total to Process</Typography.Text>
          <Typography.Title level={3} type="success">
            {totalToProcess}
          </Typography.Title>
        </div>
      </div>

      <div className={styles.stepActions}>
        <Button onClick={onBack}>Back</Button>
        <Button
          type="primary"
          onClick={onExecute}
          loading={loading}
          disabled={totalToProcess === 0}
          icon={loading ? <LoadingOutlined /> : undefined}
        >
          {loading ? 'Importing…' : 'Run Import'}
        </Button>
      </div>
    </div>
  );
};

export default SummaryStep;
