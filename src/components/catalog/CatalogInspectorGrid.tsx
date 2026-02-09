import { Input, InputNumber, Select, Typography } from 'antd';
import React from 'react';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import { useIdeSelection } from '@/ide/IdeSelectionContext';
import styles from './CatalogInspectorGrid.module.less';
import MetadataSectionTabs from './MetadataSectionTabs';

const { TextArea } = Input;

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

type Row = {
  key: string;
  label: string;
  render: () => React.ReactNode;
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
  const lastSavedRef = React.useRef<string>('');
  const saveTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!element || !elementType) {
      setDraft(null);
      lastSavedRef.current = '';
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

  const renderRows = (): Row[] => {
    const fields: Record<string, Row[]> = {
      identity: [
        {
          key: 'name',
          label: 'Name',
          render: () => (
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          ),
        },
        {
          key: 'type',
          label: 'Type',
          render: () => <Input value={draft.elementType} readOnly />,
        },
        {
          key: 'domain',
          label: 'Domain',
          render: () => <Input value={draft.domain} readOnly />,
        },
        {
          key: 'id',
          label: 'Unique ID',
          render: () => <Input value={draft.id} readOnly />,
        },
        {
          key: 'created',
          label: 'Created',
          render: () => <Input value={draft.createdAt} readOnly />,
        },
        {
          key: 'modified',
          label: 'Modified',
          render: () => <Input value={draft.lastModifiedAt} readOnly />,
        },
      ],
      governance: [
        {
          key: 'owner',
          label: 'Owner',
          render: () => (
            <Input
              value={draft.owner}
              onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
            />
          ),
        },
        {
          key: 'lifecycle',
          label: 'Lifecycle',
          render: () => (
            <Select
              value={draft.lifecycle}
              onChange={(value) => setDraft({ ...draft, lifecycle: value })}
              options={lifecycleOptions.map((value) => ({
                value,
                label: value,
              }))}
            />
          ),
        },
        {
          key: 'status',
          label: 'Status',
          render: () => (
            <Select
              value={draft.status}
              onChange={(value) => setDraft({ ...draft, status: value })}
              options={statusOptions.map((value) => ({ value, label: value }))}
            />
          ),
        },
        {
          key: 'criticality',
          label: 'Criticality',
          render: () => (
            <Select
              value={draft.criticality}
              onChange={(value) => setDraft({ ...draft, criticality: value })}
              options={criticalityOptions.map((value) => ({
                value,
                label: value,
              }))}
            />
          ),
        },
        {
          key: 'riskScore',
          label: 'Risk Score',
          render: () => (
            <InputNumber
              min={1}
              max={5}
              value={draft.riskScore ?? undefined}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  riskScore: typeof value === 'number' ? value : null,
                })
              }
            />
          ),
        },
      ],
      strategy: [
        {
          key: 'linkedObjective',
          label: 'Linked Objective',
          render: () => (
            <Input
              value={draft.linkedObjective}
              onChange={(e) =>
                setDraft({ ...draft, linkedObjective: e.target.value })
              }
            />
          ),
        },
        {
          key: 'strategicTheme',
          label: 'Strategic Theme',
          render: () => (
            <Input
              value={draft.strategicTheme}
              onChange={(e) =>
                setDraft({ ...draft, strategicTheme: e.target.value })
              }
            />
          ),
        },
        {
          key: 'roadmapPhase',
          label: 'Roadmap Phase',
          render: () => (
            <Select
              value={draft.roadmapPhase}
              onChange={(value) => setDraft({ ...draft, roadmapPhase: value })}
              options={roadmapOptions.map((value) => ({ value, label: value }))}
            />
          ),
        },
        {
          key: 'investmentPriority',
          label: 'Investment Priority',
          render: () => (
            <Select
              value={draft.investmentPriority}
              onChange={(value) =>
                setDraft({ ...draft, investmentPriority: value })
              }
              options={investmentOptions.map((value) => ({
                value,
                label: value,
              }))}
            />
          ),
        },
      ],
      financial: [
        {
          key: 'annualCost',
          label: 'Annual Cost',
          render: () => (
            <InputNumber
              value={draft.annualCost ?? undefined}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  annualCost: typeof value === 'number' ? value : null,
                })
              }
            />
          ),
        },
        {
          key: 'vendor',
          label: 'Vendor',
          render: () => (
            <Input
              value={draft.vendor}
              onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
            />
          ),
        },
        {
          key: 'contractExpiry',
          label: 'Contract Expiry',
          render: () => (
            <Input
              value={draft.contractExpiry}
              onChange={(e) =>
                setDraft({ ...draft, contractExpiry: e.target.value })
              }
            />
          ),
        },
        {
          key: 'technicalDebtScore',
          label: 'Technical Debt Score',
          render: () => (
            <InputNumber
              min={0}
              max={10}
              value={draft.technicalDebtScore ?? undefined}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  technicalDebtScore: typeof value === 'number' ? value : null,
                })
              }
            />
          ),
        },
      ],
      ops: [
        {
          key: 'sla',
          label: 'SLA',
          render: () => (
            <Select
              value={draft.sla}
              onChange={(value) => setDraft({ ...draft, sla: value })}
              options={slaOptions.map((value) => ({ value, label: value }))}
            />
          ),
        },
        {
          key: 'availabilityPct',
          label: 'Availability %',
          render: () => (
            <InputNumber
              min={0}
              max={100}
              value={draft.availabilityPct ?? undefined}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  availabilityPct: typeof value === 'number' ? value : null,
                })
              }
            />
          ),
        },
        {
          key: 'incidentRate',
          label: 'Incident Rate',
          render: () => (
            <InputNumber
              min={0}
              value={draft.incidentRate ?? undefined}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  incidentRate: typeof value === 'number' ? value : null,
                })
              }
            />
          ),
        },
        {
          key: 'performanceKpi',
          label: 'Performance KPI',
          render: () => (
            <Input
              value={draft.performanceKpi}
              onChange={(e) =>
                setDraft({ ...draft, performanceKpi: e.target.value })
              }
            />
          ),
        },
      ],
      security: [
        {
          key: 'dataClassification',
          label: 'Data Classification',
          render: () => (
            <Select
              value={draft.dataClassification}
              onChange={(value) =>
                setDraft({ ...draft, dataClassification: value })
              }
              options={classificationOptions.map((value) => ({
                value,
                label: value,
              }))}
            />
          ),
        },
        {
          key: 'regulatoryImpact',
          label: 'Regulatory Impact',
          render: () => (
            <Input
              value={draft.regulatoryImpact}
              onChange={(e) =>
                setDraft({ ...draft, regulatoryImpact: e.target.value })
              }
            />
          ),
        },
        {
          key: 'securityTier',
          label: 'Security Tier',
          render: () => (
            <Select
              value={draft.securityTier}
              onChange={(value) => setDraft({ ...draft, securityTier: value })}
              options={securityOptions.map((value) => ({
                value,
                label: value,
              }))}
            />
          ),
        },
        {
          key: 'auditStatus',
          label: 'Audit Status',
          render: () => (
            <Select
              value={draft.auditStatus}
              onChange={(value) => setDraft({ ...draft, auditStatus: value })}
              options={auditOptions.map((value) => ({ value, label: value }))}
            />
          ),
        },
      ],
      docs: [
        {
          key: 'description',
          label: 'Description',
          render: () => (
            <TextArea
              rows={2}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          ),
        },
        {
          key: 'notes',
          label: 'Notes',
          render: () => (
            <TextArea
              rows={2}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          ),
        },
        {
          key: 'constraints',
          label: 'Constraints',
          render: () => (
            <TextArea
              rows={2}
              value={draft.constraints}
              onChange={(e) =>
                setDraft({ ...draft, constraints: e.target.value })
              }
            />
          ),
        },
      ],
    };

    return fields[activeSection] ?? [];
  };

  const rows = renderRows();

  return (
    <div className={styles.inspectorRoot}>
      <MetadataSectionTabs
        tabs={sectionTabs}
        activeKey={activeSection}
        onChange={setActiveSection}
      />
      <div className={styles.tableHeader}>
        <div>Field</div>
        <div>Value</div>
      </div>
      <div className={styles.tableBody}>
        {rows.map((row) => (
          <div key={row.key} className={styles.tableRow}>
            <div className={styles.tableCellLabel}>{row.label}</div>
            <div className={styles.tableCellValue}>{row.render()}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CatalogInspectorGrid;
