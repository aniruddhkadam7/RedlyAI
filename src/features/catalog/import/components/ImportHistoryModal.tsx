// ─── Import History Modal ─────────────────────────────────────────────────

import { DownloadOutlined } from '@ant-design/icons';
import { Button, Modal, Table, Tag, Typography } from 'antd';
import React from 'react';
import styles from '../import.module.less';
import { fetchImportHistory } from '../services/import.api';
import type { ImportBatch } from '../types/import.types';

type ImportHistoryModalProps = {
  open: boolean;
  onClose: () => void;
};

const statusColors: Record<string, string> = {
  COMPLETED: 'green',
  FAILED: 'red',
  IMPORTING: 'blue',
  PENDING: 'default',
  CANCELLED: 'default',
};

const ImportHistoryModal: React.FC<ImportHistoryModalProps> = ({
  open,
  onClose,
}) => {
  const [batches, setBatches] = React.useState<ImportBatch[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);

  const loadHistory = React.useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetchImportHistory(p, 10);
      if (res.success) {
        setBatches(res.data);
        setTotal(res.pagination?.total ?? 0);
      }
    } catch {
      // Silently fail — history is non-critical.
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) loadHistory(page);
  }, [open, page, loadHistory]);

  const columns = [
    {
      title: 'File',
      dataIndex: 'fileName',
      key: 'fileName',
      width: 200,
      render: (text: string) => (
        <Typography.Text ellipsis>{text}</Typography.Text>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (text: string) => (text ? new Date(text).toLocaleString() : '—'),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (text: string) => (
        <Tag color={statusColors[text] ?? 'default'}>{text}</Tag>
      ),
    },
    {
      title: 'Total',
      dataIndex: 'totalRecords',
      key: 'totalRecords',
      width: 70,
    },
    {
      title: 'Success',
      dataIndex: 'successCount',
      key: 'successCount',
      width: 80,
      render: (val: number) => (
        <Typography.Text type="success">{val}</Typography.Text>
      ),
    },
    {
      title: 'Failed',
      dataIndex: 'failureCount',
      key: 'failureCount',
      width: 70,
      render: (val: number) =>
        val > 0 ? <Typography.Text type="danger">{val}</Typography.Text> : val,
    },
    {
      title: 'Errors',
      key: 'errors',
      width: 80,
      render: (_: unknown, record: ImportBatch) => {
        const errors = record.errorReport ?? [];
        if (errors.length === 0) return '—';
        return (
          <Button
            type="link"
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => {
              const headers = ['Row', 'Field', 'Value', 'Error'];
              const lines = [headers.join(',')];
              for (const err of errors) {
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
              link.download = `errors-${record.id.slice(0, 8)}.csv`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            CSV
          </Button>
        );
      },
    },
  ];

  return (
    <Modal
      title="Import History"
      open={open}
      onCancel={onClose}
      footer={null}
      width={880}
      className={styles.historyModal}
    >
      <Table
        dataSource={batches}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{
          current: page,
          total,
          pageSize: 10,
          onChange: setPage,
          showSizeChanger: false,
        }}
        className={styles.historyTable}
      />
    </Modal>
  );
};

export default ImportHistoryModal;
