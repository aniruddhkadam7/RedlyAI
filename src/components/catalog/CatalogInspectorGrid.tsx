import { Input, InputNumber, Select, Typography } from 'antd';
import React from 'react';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import { useIdeSelection } from '@/ide/IdeSelectionContext';
import styles from './CatalogInspectorGrid.module.less';
import MetadataSectionTabs from './MetadataSectionTabs';

type InspectorDraft = {
  name: string;
  elementType: string;
  domain: string;
  id: string;
  createdAt: string;
  lastModifiedAt: string;
  owner: string;
  lifecycle: string;
  status: string;
  criticality: string;
  riskScore: number | null;
  linkedObjective: string;
  strategicTheme: string;
  roadmapPhase: string;
  investmentPriority: string;
  annualCost: number | null;
  vendor: string;
  contractExpiry: string;
  technicalDebtScore: number | null;
  sla: string;
  availabilityPct: number | null;
  incidentRate: number | null;
  performanceKpi: string;
  dataClassification: string;
  regulatoryImpact: string;
  securityTier: string;
  auditStatus: string;
  description: string;
  notes: string;
  constraints: string;
};

type ColumnType = 'text' | 'number' | 'select';

type ColumnDef = {
  key: keyof InspectorDraft;
  label: string;
  type: ColumnType;
  readOnly?: boolean;
  options?: string[];
  width?: string;
};

const lifecycleOptions = ['Draft', 'Active', 'Retired'];
const statusOptions = ['Approved', 'In Review', 'Deprecated'];
const criticalityOptions = ['Low', 'Medium', 'High', 'Mission Critical'];
const investmentOptions = ['Low', 'Medium', 'High', 'Strategic'];
const roadmapOptions = ['Vision', 'Plan', 'Build', 'Run'];
const slaOptions = ['Bronze', 'Silver', 'Gold', 'Platinum'];
const classificationOptions = [
  'Public',
  'Internal',
  'Confidential',
  'Restricted',
];
const securityOptions = ['Tier 1', 'Tier 2', 'Tier 3'];
const auditOptions = ['Planned', 'In Progress', 'Complete'];

const readString = (value: unknown) => String(value ?? '').trim();
const readNumber = (value: unknown) =>
  typeof value === 'number' ? value : value ? Number(value) : null;

const domainFromType = (type: string) => {
  const normalized = type.toLowerCase();
  if (normalized.includes('business')) return 'Business';
  if (normalized.includes('application')) return 'Application';
  if (normalized.includes('data')) return 'Data';
  if (normalized.includes('technology') || normalized.includes('infra'))
    return 'Technology';
  if (normalized.includes('programme') || normalized.includes('project'))
    return 'Implementation';
  return 'Business';
};

const buildDraft = (
  elementId: string,
  elementType: string,
  attributes: Record<string, unknown>,
): InspectorDraft => ({
  name: readString(attributes.name ?? elementId),
  elementType,
  domain: readString(attributes.domain ?? domainFromType(elementType)),
  id: elementId,
  createdAt: readString(attributes.createdAt),
  lastModifiedAt: readString(attributes.lastModifiedAt),
  owner: readString(attributes.ownerName ?? attributes.owner),
  lifecycle: readString(
    attributes.lifecycleState ?? attributes.lifecycleStatus,
  ),
  status: readString(attributes.approvalStatus ?? attributes.status),
  criticality: readString(
    attributes.criticality ?? attributes.businessCriticality,
  ),
  riskScore: readNumber(attributes.riskRating ?? attributes.riskScore),
  linkedObjective: readString(
    attributes.linkedObjective ??
      (Array.isArray(attributes.linkedObjectives)
        ? attributes.linkedObjectives.join(', ')
        : ''),
  ),
  strategicTheme: readString(attributes.strategicTheme),
  roadmapPhase: readString(attributes.roadmapPhase),
  investmentPriority: readString(attributes.investmentPriority),
  annualCost: readNumber(attributes.annualCost),
  vendor: readString(attributes.vendor),
  contractExpiry: readString(attributes.contractExpiry),
  technicalDebtScore: readNumber(attributes.technicalDebtScore),
  sla: readString(attributes.slaLevel ?? attributes.sla),
  availabilityPct: readNumber(attributes.availabilityPct),
  incidentRate: readNumber(attributes.incidentRate),
  performanceKpi: readString(attributes.performanceKpi),
  dataClassification: readString(attributes.dataClassification),
  regulatoryImpact: readString(attributes.regulatoryImpact),
  securityTier: readString(attributes.securityTier),
  auditStatus: readString(attributes.auditStatus),
  description: readString(attributes.description),
  notes: readString(attributes.notes),
  constraints: readString(attributes.constraints),
});

const CatalogInspectorGrid: React.FC = () => {
  const { eaRepository, trySetEaRepository } = useEaRepository();
  const { selection } = useIdeSelection();
  const elementId = selection.selectedElementId;
  const elementType = selection.selectedElementType;
  const element = React.useMemo(() => {
    if (!eaRepository || !elementId) return null;
    return eaRepository.objects.get(elementId) ?? null;
  }, [eaRepository, elementId]);

  const [draft, setDraft] = React.useState<InspectorDraft | null>(null);
  const [activeSection, setActiveSection] = React.useState('identity');
  const [editingKey, setEditingKey] = React.useState<
    keyof InspectorDraft | null
  >(null);
  const [editingValue, setEditingValue] = React.useState<
    string | number | null
  >(null);
  const lastSavedRef = React.useRef<string>('');
  const saveTimerRef = React.useRef<number | null>(null);
  const editInputRef = React.useRef<Record<string, HTMLElement | null>>({});

  React.useEffect(() => {
    if (!element || !elementType) {
      setDraft(null);
      lastSavedRef.current = '';
      setEditingKey(null);
      setEditingValue(null);
      return;
    }
    const nextDraft = buildDraft(
      element.id,
      elementType,
      element.attributes ?? {},
    );
    setDraft(nextDraft);
    lastSavedRef.current = JSON.stringify(nextDraft);
  }, [element, elementType]);

  React.useEffect(() => {
    if (!draft || !elementId || !eaRepository) return;
    const serialized = JSON.stringify(draft);
    if (serialized === lastSavedRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const patch: Record<string, unknown> = {
        name: draft.name,
        domain: draft.domain,
        ownerName: draft.owner,
        lifecycleState: draft.lifecycle,
        approvalStatus: draft.status,
        criticality: draft.criticality,
        riskRating: draft.riskScore ?? undefined,
        linkedObjectives: draft.linkedObjective
          ? draft.linkedObjective
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean)
          : [],
        strategicTheme: draft.strategicTheme,
        roadmapPhase: draft.roadmapPhase,
        investmentPriority: draft.investmentPriority,
        annualCost: draft.annualCost ?? undefined,
        vendor: draft.vendor,
        contractExpiry: draft.contractExpiry,
        technicalDebtScore: draft.technicalDebtScore ?? undefined,
        slaLevel: draft.sla,
        availabilityPct: draft.availabilityPct ?? undefined,
        incidentRate: draft.incidentRate ?? undefined,
        performanceKpi: draft.performanceKpi,
        dataClassification: draft.dataClassification,
        regulatoryImpact: draft.regulatoryImpact,
        securityTier: draft.securityTier,
        auditStatus: draft.auditStatus,
        description: draft.description,
        notes: draft.notes,
        constraints: draft.constraints,
        lastModifiedAt: new Date().toISOString(),
      };

      const next = eaRepository.clone();
      const updated = next.updateObjectAttributes(elementId, patch, 'merge');
      if (updated.ok) {
        trySetEaRepository(next);
        lastSavedRef.current = JSON.stringify(draft);
      }
    }, 400);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [draft, eaRepository, elementId, trySetEaRepository]);

  const setDraftField = React.useCallback(
    (key: keyof InspectorDraft, value: string | number | null) => {
      if (!draft) return;
      setDraft({ ...draft, [key]: value ?? '' } as InspectorDraft);
    },
    [draft],
  );

  const focusEditor = React.useCallback((key: keyof InspectorDraft) => {
    window.requestAnimationFrame(() => {
      const node = editInputRef.current[String(key)];
      if (node && 'focus' in node) {
        (node as HTMLElement).focus();
      }
    });
  }, []);

  const startEdit = React.useCallback(
    (key: keyof InspectorDraft, value: string | number | null) => {
      setEditingKey(key);
      setEditingValue(value ?? '');
      focusEditor(key);
    },
    [focusEditor],
  );

  const commitEdit = React.useCallback(() => {
    if (!editingKey) return;
    setDraftField(editingKey, editingValue ?? '');
    setEditingKey(null);
    setEditingValue(null);
  }, [editingKey, editingValue, setDraftField]);

  const cancelEdit = React.useCallback(() => {
    setEditingKey(null);
    setEditingValue(null);
  }, []);

  const sectionTabs = [
    { key: 'identity', label: 'Identity' },
    { key: 'governance', label: 'Governance' },
    { key: 'strategy', label: 'Strategy' },
    { key: 'financial', label: 'Financial' },
    { key: 'ops', label: 'Operational' },
    { key: 'security', label: 'Security' },
    { key: 'docs', label: 'Docs' },
  ];

  if (!draft) {
    return (
      <div className={styles.emptyState}>
        <Typography.Text type="secondary">
          Select an element in the registry to inspect.
        </Typography.Text>
      </div>
    );
  }

  const columnsBySection: Record<string, ColumnDef[]> = {
    identity: [
      { key: 'name', label: 'Name', type: 'text', width: 'minmax(160px, 1fr)' },
      { key: 'elementType', label: 'Type', type: 'text' },
      { key: 'domain', label: 'Domain', type: 'text' },
      {
        key: 'id',
        label: 'Unique ID',
        type: 'text',
        readOnly: true,
        width: 'minmax(220px, 1fr)',
      },
      { key: 'createdAt', label: 'Created', type: 'text', readOnly: true },
      {
        key: 'lastModifiedAt',
        label: 'Modified',
        type: 'text',
        readOnly: true,
      },
    ],
    governance: [
      {
        key: 'owner',
        label: 'Owner',
        type: 'text',
        width: 'minmax(160px, 1fr)',
      },
      {
        key: 'lifecycle',
        label: 'Lifecycle',
        type: 'select',
        options: lifecycleOptions,
      },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: statusOptions,
      },
      {
        key: 'criticality',
        label: 'Criticality',
        type: 'select',
        options: criticalityOptions,
      },
      { key: 'riskScore', label: 'Risk Score', type: 'number' },
    ],
    strategy: [
      {
        key: 'linkedObjective',
        label: 'Linked Objective',
        type: 'text',
        width: 'minmax(180px, 1fr)',
      },
      {
        key: 'strategicTheme',
        label: 'Strategic Theme',
        type: 'text',
        width: 'minmax(160px, 1fr)',
      },
      {
        key: 'roadmapPhase',
        label: 'Roadmap Phase',
        type: 'select',
        options: roadmapOptions,
      },
      {
        key: 'investmentPriority',
        label: 'Investment Priority',
        type: 'select',
        options: investmentOptions,
      },
    ],
    financial: [
      { key: 'annualCost', label: 'Annual Cost', type: 'number' },
      {
        key: 'vendor',
        label: 'Vendor',
        type: 'text',
        width: 'minmax(160px, 1fr)',
      },
      { key: 'contractExpiry', label: 'Contract Expiry', type: 'text' },
      {
        key: 'technicalDebtScore',
        label: 'Technical Debt Score',
        type: 'number',
      },
    ],
    ops: [
      { key: 'sla', label: 'SLA', type: 'select', options: slaOptions },
      { key: 'availabilityPct', label: 'Availability %', type: 'number' },
      { key: 'incidentRate', label: 'Incident Rate', type: 'number' },
      {
        key: 'performanceKpi',
        label: 'Performance KPI',
        type: 'text',
        width: 'minmax(180px, 1fr)',
      },
    ],
    security: [
      {
        key: 'dataClassification',
        label: 'Data Classification',
        type: 'select',
        options: classificationOptions,
        width: 'minmax(200px, 1fr)',
      },
      {
        key: 'regulatoryImpact',
        label: 'Regulatory Impact',
        type: 'text',
        width: 'minmax(180px, 1fr)',
      },
      {
        key: 'securityTier',
        label: 'Security Tier',
        type: 'select',
        options: securityOptions,
      },
      {
        key: 'auditStatus',
        label: 'Audit Status',
        type: 'select',
        options: auditOptions,
      },
    ],
    docs: [
      {
        key: 'description',
        label: 'Description',
        type: 'text',
        width: 'minmax(240px, 1fr)',
      },
      {
        key: 'notes',
        label: 'Notes',
        type: 'text',
        width: 'minmax(200px, 1fr)',
      },
      {
        key: 'constraints',
        label: 'Constraints',
        type: 'text',
        width: 'minmax(200px, 1fr)',
      },
    ],
  };

  const columns = columnsBySection[activeSection] ?? [];
  const editableColumns = columns.filter((column) => !column.readOnly);

  const moveToNextEditable = (direction: 1 | -1) => {
    if (!editingKey) return;
    const currentIndex = editableColumns.findIndex(
      (column) => column.key === editingKey,
    );
    if (currentIndex === -1) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= editableColumns.length) return;
    const nextColumn = editableColumns[nextIndex];
    const nextValue = draft ? draft[nextColumn.key] : '';
    startEdit(nextColumn.key, (nextValue ?? '') as string | number | null);
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      commitEdit();
      moveToNextEditable(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      commitEdit();
      moveToNextEditable(1);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      commitEdit();
      moveToNextEditable(-1);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      commitEdit();
      moveToNextEditable(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      commitEdit();
      moveToNextEditable(-1);
    }
  };

  const renderCell = (column: ColumnDef) => {
    if (!draft) return null;
    const value = draft[column.key];
    const isEditing = editingKey === column.key && !column.readOnly;
    const isActive = editingKey === column.key;
    if (!isEditing) {
      const isEmpty = !(value || value === 0);
      return (
        <div
          className={`${styles.gridCell} ${column.readOnly ? styles.gridCellReadOnly : ''} ${isEmpty ? styles.gridCellEmpty : ''} ${isActive ? styles.gridCellActive : ''}`}
          onClick={() => {
            if (column.readOnly) return;
            startEdit(column.key, (value ?? '') as string | number | null);
          }}
        >
          {value || value === 0 ? String(value) : ''}
        </div>
      );
    }

    if (column.type === 'number') {
      const numberValue =
        typeof editingValue === 'number'
          ? editingValue
          : editingValue
            ? Number(editingValue)
            : undefined;
      return (
        <InputNumber
          value={numberValue}
          onChange={(next) =>
            setEditingValue(typeof next === 'number' ? next : null)
          }
          onKeyDown={handleEditorKeyDown}
          onBlur={commitEdit}
          ref={(node) => {
            editInputRef.current[String(column.key)] = node;
          }}
        />
      );
    }

    if (column.type === 'select') {
      return (
        <Select
          value={String(editingValue ?? '')}
          onChange={(next) => {
            setEditingValue(next);
            setDraftField(column.key, next);
            setEditingKey(null);
          }}
          options={(column.options ?? []).map((option) => ({
            value: option,
            label: option,
          }))}
          onKeyDown={handleEditorKeyDown}
          ref={(node) => {
            editInputRef.current[String(column.key)] =
              node as HTMLElement | null;
          }}
        />
      );
    }

    return (
      <Input
        value={String(editingValue ?? '')}
        onChange={(event) => setEditingValue(event.target.value)}
        onKeyDown={handleEditorKeyDown}
        onBlur={commitEdit}
        ref={(node) => {
          editInputRef.current[String(column.key)] = node;
        }}
      />
    );
  };

  return (
    <div className={styles.inspectorRoot}>
      <MetadataSectionTabs
        tabs={sectionTabs}
        activeKey={activeSection}
        onChange={setActiveSection}
      />
      <div className={styles.gridWrap}>
        <div
          className={styles.gridHeader}
          style={{
            gridTemplateColumns: `28px ${columns
              .map((column) => column.width ?? 'minmax(140px, 1fr)')
              .join(' ')}`,
          }}
        >
          <div className={styles.gridHeaderCell} />
          {columns.map((column) => (
            <div key={String(column.key)} className={styles.gridHeaderCell}>
              {column.label}
            </div>
          ))}
        </div>
        <div className={styles.gridBody}>
          <div
            className={styles.gridRow}
            style={{
              gridTemplateColumns: `28px ${columns
                .map((column) => column.width ?? 'minmax(140px, 1fr)')
                .join(' ')}`,
            }}
          >
            <div className={styles.gridCellWrapper} />
            {columns.map((column) => (
              <div
                key={String(column.key)}
                className={`${styles.gridCellWrapper} ${editingKey === column.key ? styles.gridCellActive : ''}`}
              >
                {renderCell(column)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CatalogInspectorGrid;
