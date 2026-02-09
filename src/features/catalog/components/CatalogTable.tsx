import { Button, Dropdown, Input, Select, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import React from 'react';
import type { ResizeCallbackData } from 'react-resizable';
import { Resizable } from 'react-resizable';
import styles from '../catalog.module.less';
import type { CatalogElement, CatalogSortState } from '../types/catalog.types';

const ResizableTitle: React.FC<
  React.HTMLAttributes<HTMLTableCellElement> & {
    onResize?: (
      e: React.SyntheticEvent<Element>,
      data: ResizeCallbackData,
    ) => void;
    width?: number;
  }
> = ({ onResize, width, ...restProps }) => {
  if (!width) return <th {...restProps} />;

  return (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className={styles.resizeHandle}
          onClick={(event) => event.stopPropagation()}
        />
      }
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps} />
    </Resizable>
  );
};

const lifecycleColor = (value: string) => {
  const normalized = value.toLowerCase();
  if (normalized === 'active') return 'green';
  if (normalized === 'retired') return 'red';
  if (normalized === 'planned' || normalized === 'draft') return 'gold';
  return 'default';
};

const renderNullable = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text ? text : '-';
};

const lifecycleOptions = ['Draft', 'Active', 'Retired'];

export type CatalogTableProps = {
  data: CatalogElement[];
  loading: boolean;
  onRowClick: (record: CatalogElement) => void;
  onEmptyClick?: () => void;
  onSortChange: (sort: CatalogSortState) => void;
  onUpdateField: (args: {
    id: string;
    field: 'name' | 'owner' | 'lifecycle';
    value: string;
  }) => void;
  onAction: (
    record: CatalogElement,
    action: 'reveal' | 'new-view' | 'relationships' | 'delete',
  ) => void;
  onUsedInViewsClick: (record: CatalogElement) => void;
  rowSelection: {
    selectedRowKeys: React.Key[];
    onChange: (selectedRowKeys: React.Key[]) => void;
  };
  highlightId?: string | null;
  visibleColumns: string[];
  scrollY: number;
};

const CatalogTable: React.FC<CatalogTableProps> = ({
  data,
  loading,
  onRowClick,
  onEmptyClick,
  onSortChange,
  onUpdateField,
  onAction,
  onUsedInViewsClick,
  rowSelection,
  highlightId,
  visibleColumns,
  scrollY,
}) => {
  const tableRef = React.useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = React.useState<{
    id: string;
    field: 'name' | 'owner' | 'lifecycle';
  } | null>(null);

  React.useEffect(() => {
    if (!highlightId) return;
    const container = tableRef.current;
    if (!container) return;
    const row = container.querySelector(
      `tr[data-row-key="${highlightId}"]`,
    ) as HTMLElement | null;
    if (row) {
      row.scrollIntoView({ block: 'center' });
    }
  }, [highlightId]);

  const [columns, setColumns] = React.useState<ColumnsType<CatalogElement>>([
    {
      title: 'Name',
      dataIndex: 'name',
      width: 240,
      sorter: true,
      key: 'name',
      render: (value, record) => {
        const isEditing = editing?.id === record.id && editing.field === 'name';
        if (isEditing) {
          return (
            <Input
              autoFocus
              defaultValue={String(value)}
              onBlur={(event) => {
                onUpdateField({
                  id: record.id,
                  field: 'name',
                  value: event.target.value,
                });
                setEditing(null);
              }}
              onPressEnter={(event) => {
                onUpdateField({
                  id: record.id,
                  field: 'name',
                  value: event.currentTarget.value,
                });
                setEditing(null);
              }}
            />
          );
        }
        return (
          <Button
            type="link"
            onClick={() => setEditing({ id: record.id, field: 'name' })}
          >
            {renderNullable(value)}
          </Button>
        );
      },
    },
    {
      title: 'Type',
      dataIndex: 'elementType',
      width: 160,
      sorter: true,
      key: 'elementType',
    },
    {
      title: 'Owner',
      dataIndex: 'owner',
      width: 200,
      sorter: true,
      key: 'owner',
      render: (value, record) => {
        const isEditing =
          editing?.id === record.id && editing.field === 'owner';
        if (isEditing) {
          return (
            <Input
              autoFocus
              defaultValue={String(value)}
              onBlur={(event) => {
                onUpdateField({
                  id: record.id,
                  field: 'owner',
                  value: event.target.value,
                });
                setEditing(null);
              }}
              onPressEnter={(event) => {
                onUpdateField({
                  id: record.id,
                  field: 'owner',
                  value: event.currentTarget.value,
                });
                setEditing(null);
              }}
            />
          );
        }
        return (
          <div className={styles.ownerCell}>
            <Button
              type="link"
              onClick={() => setEditing({ id: record.id, field: 'owner' })}
            >
              {renderNullable(value)}
            </Button>
            {record.ownerRole ? (
              <Typography.Text type="secondary" className={styles.ownerRole}>
                {record.ownerRole}
              </Typography.Text>
            ) : null}
          </div>
        );
      },
    },
    {
      title: 'Lifecycle',
      dataIndex: 'lifecycle',
      width: 140,
      sorter: true,
      key: 'lifecycle',
      render: (value, record) => {
        const isEditing =
          editing?.id === record.id && editing.field === 'lifecycle';
        if (isEditing) {
          return (
            <Select
              autoFocus
              defaultValue={String(value) || 'Active'}
              onChange={(next) => {
                onUpdateField({
                  id: record.id,
                  field: 'lifecycle',
                  value: next,
                });
                setEditing(null);
              }}
              options={lifecycleOptions.map((option) => ({
                value: option,
                label: option,
              }))}
              style={{ width: 120 }}
            />
          );
        }
        return (
          <Button
            type="text"
            onClick={() => setEditing({ id: record.id, field: 'lifecycle' })}
          >
            <Tag color={lifecycleColor(String(value))}>
              {value || 'Unknown'}
            </Tag>
          </Button>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      sorter: true,
      key: 'status',
      render: (value) => renderNullable(value),
    },
    {
      title: 'Criticality',
      dataIndex: 'criticality',
      width: 140,
      sorter: true,
      key: 'criticality',
      render: (value) => renderNullable(value),
    },
    {
      title: 'Relationships',
      dataIndex: 'relationshipsCount',
      width: 150,
      sorter: true,
      key: 'relationshipsCount',
    },
    {
      title: 'Used In Views',
      dataIndex: 'usedInViewsCount',
      width: 150,
      sorter: true,
      key: 'usedInViewsCount',
      render: (_value, record) => (
        <Button type="link" onClick={() => onUsedInViewsClick(record)}>
          {record.usedInViewsCount > 0
            ? `Yes (${record.usedInViewsCount})`
            : 'No'}
        </Button>
      ),
    },
    {
      title: 'Last Modified',
      dataIndex: 'lastModifiedAt',
      width: 170,
      sorter: true,
      key: 'lastModifiedAt',
      render: (value) => (value ? new Date(value).toLocaleDateString() : '-'),
    },
    {
      title: 'Created Date',
      dataIndex: 'createdAt',
      width: 170,
      sorter: true,
      key: 'createdAt',
      render: (value) => (value ? new Date(value).toLocaleDateString() : '-'),
    },
    {
      title: '',
      dataIndex: 'actions',
      width: 56,
      key: 'actions',
      fixed: 'right',
      render: (_value, record) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'reveal', label: 'Reveal in Current View' },
              { key: 'new-view', label: 'Open in New View' },
              { key: 'relationships', label: 'Show Relationships' },
              { key: 'delete', label: 'Delete' },
            ],
            onClick: (info) => {
              onAction(record, info.key as any);
            },
          }}
        >
          <Button
            type="text"
            aria-label="Row actions"
            onClick={(event) => event.stopPropagation()}
          >
            ...
          </Button>
        </Dropdown>
      ),
    },
  ]);

  const handleResize = React.useCallback(
    (index: number) =>
      (_: React.SyntheticEvent<Element>, { size }: ResizeCallbackData) => {
        setColumns((prev) => {
          const next = [...prev];
          next[index] = { ...next[index], width: size.width };
          return next;
        });
      },
    [],
  );

  const mergedColumns = columns.map((column, index) => ({
    ...column,
    onHeaderCell: (col: any) => ({
      width: col.width,
      onResize: handleResize(index),
    }),
  }));

  const visible = mergedColumns.filter(
    (column) => !column.key || visibleColumns.includes(String(column.key)),
  );

  const handleChange = (
    _pagination: unknown,
    _filters: Record<string, React.Key[] | null>,
    sorter: any,
  ) => {
    const sortBy = sorter?.field as string | undefined;
    const sortOrder = sorter?.order
      ? sorter.order === 'descend'
        ? 'desc'
        : 'asc'
      : undefined;
    onSortChange({ sortBy, sortOrder });
  };

  const virtualProps = { virtual: true } as any;

  return (
    <div
      ref={tableRef}
      className={styles.catalogTableWrap}
      onClick={(event) => {
        if (!onEmptyClick) return;
        const target = event.target as HTMLElement | null;
        if (!target) return;
        if (target.closest('tr')) return;
        if (target.closest('thead')) return;
        if (target.closest('.ant-table-cell')) return;
        onEmptyClick();
      }}
    >
      <Table<CatalogElement>
        className={styles.catalogTable}
        rowKey="id"
        loading={loading}
        dataSource={data}
        pagination={false}
        onChange={handleChange}
        columns={visible}
        components={{ header: { cell: ResizableTitle } }}
        tableLayout="fixed"
        scroll={{ x: '100%', y: scrollY }}
        sticky={false}
        rowSelection={{
          selectedRowKeys: rowSelection.selectedRowKeys,
          onChange: rowSelection.onChange,
          columnWidth: 28,
        }}
        rowClassName={(record) =>
          highlightId && record.id === highlightId ? styles.highlightRow : ''
        }
        onRow={(record) => ({
          onClick: (event) => {
            event.stopPropagation();
            onRowClick(record);
          },
        })}
        {...virtualProps}
      />
    </div>
  );
};

export default CatalogTable;
