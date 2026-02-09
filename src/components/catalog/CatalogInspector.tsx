import type { CollapseProps } from 'antd';
import { Collapse, Input, InputNumber, Select, Typography } from 'antd';
import React from 'react';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import { useIdeSelection } from '@/ide/IdeSelectionContext';
import styles from './CatalogInspector.module.less';

const { TextArea } = Input;

type InspectorDraft = {
  name: string;
  elementType: string;
  domain: string;
  id: string;
  createdAt: string;
  lastModifiedAt: string;
  businessOwner: string;
  itOwner: string;
  lifecycle: string;
  status: string;
  criticality: string;
  riskRating: number | null;
  linkedObjectives: string[];
  strategicTheme: string;
  investmentPriority: string;
  roadmapPhase: string;
  annualCost: number | null;
  vendor: string;
  contractExpiry: string;
  licensingModel: string;
  technicalDebtScore: number | null;
  slaLevel: string;
  availabilityPct: number | null;
  incidentRate: number | null;
  performanceKpi: string;
  dataClassification: string;
  regulatoryImpact: string;
  securityTier: string;
  auditStatus: string;
  description: string;
  assumptions: string;
  constraints: string;
  notes: string;
};

const lifecycleOptions = ['Draft', 'Active', 'Retired'];
const statusOptions = ['Approved', 'In Review', 'Deprecated'];
const criticalityOptions = ['Low', 'Medium', 'High', 'Mission Critical'];
const investmentOptions = ['Low', 'Medium', 'High', 'Strategic'];
const roadmapOptions = ['Vision', 'Plan', 'Build', 'Run'];
const licensingOptions = ['Perpetual', 'Subscription', 'Usage'];
const slaOptions = ['Bronze', 'Silver', 'Gold', 'Platinum'];
const classificationOptions = [
  'Public',
  'Internal',
  'Confidential',
  'Restricted',
];
const securityOptions = ['Tier 1', 'Tier 2', 'Tier 3'];
const auditOptions = ['Planned', 'In Progress', 'Complete'];

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

const readString = (value: unknown) => String(value ?? '').trim();
const readNumber = (value: unknown) =>
  typeof value === 'number' ? value : value ? Number(value) : null;
const readArray = (value: unknown) =>
  Array.isArray(value) ? value.map((v) => String(v)) : [];

const buildDraft = (
  elementId: string,
  elementType: string,
  attributes: Record<string, unknown>,
) => ({
  name: readString(attributes.name ?? elementId),
  elementType,
  domain: readString(attributes.domain ?? domainFromType(elementType)),
  id: elementId,
  createdAt: readString(attributes.createdAt),
  lastModifiedAt: readString(attributes.lastModifiedAt),
  businessOwner: readString(attributes.ownerName ?? attributes.businessOwner),
  itOwner: readString(attributes.ownerRole ?? attributes.itOwner),
  lifecycle: readString(
    attributes.lifecycleState ?? attributes.lifecycleStatus,
  ),
  status: readString(attributes.approvalStatus ?? attributes.status),
  criticality: readString(
    attributes.criticality ?? attributes.businessCriticality,
  ),
  riskRating: readNumber(attributes.riskRating),
  linkedObjectives: readArray(attributes.linkedObjectives),
  strategicTheme: readString(attributes.strategicTheme),
  investmentPriority: readString(attributes.investmentPriority),
  roadmapPhase: readString(attributes.roadmapPhase),
  annualCost: readNumber(attributes.annualCost),
  vendor: readString(attributes.vendor),
  contractExpiry: readString(attributes.contractExpiry),
  licensingModel: readString(attributes.licensingModel),
  technicalDebtScore: readNumber(attributes.technicalDebtScore),
  slaLevel: readString(attributes.slaLevel),
  availabilityPct: readNumber(attributes.availabilityPct),
  incidentRate: readNumber(attributes.incidentRate),
  performanceKpi: readString(attributes.performanceKpi),
  dataClassification: readString(attributes.dataClassification),
  regulatoryImpact: readString(attributes.regulatoryImpact),
  securityTier: readString(attributes.securityTier),
  auditStatus: readString(attributes.auditStatus),
  description: readString(attributes.description),
  assumptions: readString(attributes.assumptions),
  constraints: readString(attributes.constraints),
  notes: readString(attributes.notes),
});

type FieldProps = {
  label: string;
  children: React.ReactNode;
};

const Field: React.FC<FieldProps> = ({ label, children }) => (
  <div className={styles.field}>
    <Typography.Text className={styles.fieldLabel}>{label}</Typography.Text>
    {children}
  </div>
);

const CatalogInspector: React.FC = () => {
  const { eaRepository, trySetEaRepository } = useEaRepository();
  const { selection } = useIdeSelection();
  const elementId = selection.selectedElementId;
  const elementType = selection.selectedElementType;
  const element = React.useMemo(() => {
    if (!eaRepository || !elementId) return null;
    return eaRepository.objects.get(elementId) ?? null;
  }, [eaRepository, elementId]);

  const [draft, setDraft] = React.useState<InspectorDraft | null>(null);
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
        ownerName: draft.businessOwner,
        ownerRole: draft.itOwner,
        lifecycleState: draft.lifecycle,
        approvalStatus: draft.status,
        criticality: draft.criticality,
        riskRating: draft.riskRating ?? undefined,
        linkedObjectives: draft.linkedObjectives,
        strategicTheme: draft.strategicTheme,
        investmentPriority: draft.investmentPriority,
        roadmapPhase: draft.roadmapPhase,
        annualCost: draft.annualCost ?? undefined,
        vendor: draft.vendor,
        contractExpiry: draft.contractExpiry,
        licensingModel: draft.licensingModel,
        technicalDebtScore: draft.technicalDebtScore ?? undefined,
        slaLevel: draft.slaLevel,
        availabilityPct: draft.availabilityPct ?? undefined,
        incidentRate: draft.incidentRate ?? undefined,
        performanceKpi: draft.performanceKpi,
        dataClassification: draft.dataClassification,
        regulatoryImpact: draft.regulatoryImpact,
        securityTier: draft.securityTier,
        auditStatus: draft.auditStatus,
        description: draft.description,
        assumptions: draft.assumptions,
        constraints: draft.constraints,
        notes: draft.notes,
        lastModifiedAt: new Date().toISOString(),
      };

      const next = eaRepository.clone();
      const updated = next.updateObjectAttributes(elementId, patch, 'merge');
      if (updated.ok) {
        trySetEaRepository(next);
        lastSavedRef.current = JSON.stringify(draft);
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [draft, eaRepository, elementId, trySetEaRepository]);

  if (!draft) {
    return (
      <div className={styles.emptyState}>
        <Typography.Text type="secondary">
          Select an element in the registry to inspect.
        </Typography.Text>
      </div>
    );
  }

  const items: CollapseProps['items'] = [
    {
      key: 'identity',
      label: 'Identity',
      children: (
        <div className={styles.sectionGrid}>
          <Field label="Element Name">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="Element Type">
            <Input value={draft.elementType} readOnly />
          </Field>
          <Field label="Domain">
            <Input value={draft.domain} readOnly />
          </Field>
          <Field label="Unique ID">
            <Input value={draft.id} readOnly />
          </Field>
          <Field label="Created Date">
            <Input value={draft.createdAt} readOnly />
          </Field>
          <Field label="Last Modified">
            <Input value={draft.lastModifiedAt} readOnly />
          </Field>
        </div>
      ),
    },
    {
      key: 'governance',
      label: 'Governance',
      children: (
        <div className={styles.sectionGrid}>
          <Field label="Business Owner">
            <Input
              value={draft.businessOwner}
              onChange={(e) =>
                setDraft({ ...draft, businessOwner: e.target.value })
              }
            />
          </Field>
          <Field label="IT Owner">
            <Input
              value={draft.itOwner}
              onChange={(e) => setDraft({ ...draft, itOwner: e.target.value })}
            />
          </Field>
          <Field label="Lifecycle">
            <Select
              value={draft.lifecycle}
              onChange={(value) => setDraft({ ...draft, lifecycle: value })}
              options={lifecycleOptions.map((value) => ({
                value,
                label: value,
              }))}
            />
          </Field>
          <Field label="Status">
            <Select
              value={draft.status}
              onChange={(value) => setDraft({ ...draft, status: value })}
              options={statusOptions.map((value) => ({ value, label: value }))}
            />
          </Field>
          <Field label="Criticality">
            <Select
              value={draft.criticality}
              onChange={(value) => setDraft({ ...draft, criticality: value })}
              options={criticalityOptions.map((value) => ({
                value,
                label: value,
              }))}
            />
          </Field>
          <Field label="Risk Rating">
            <InputNumber
              min={1}
              max={5}
              value={draft.riskRating ?? undefined}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  riskRating: typeof value === 'number' ? value : null,
                })
              }
            />
          </Field>
        </div>
      ),
    },
    {
      key: 'strategy',
      label: 'Strategy Alignment',
      children: (
        <div className={styles.sectionGrid}>
          <Field label="Linked Objective">
            <Select
              mode="multiple"
              value={draft.linkedObjectives}
              onChange={(value) =>
                setDraft({ ...draft, linkedObjectives: value })
              }
              options={draft.linkedObjectives.map((value) => ({
                value,
                label: value,
              }))}
            />
          </Field>
          <Field label="Strategic Theme">
            <Input
              value={draft.strategicTheme}
              onChange={(e) =>
                setDraft({ ...draft, strategicTheme: e.target.value })
              }
            />
          </Field>
          <Field label="Investment Priority">
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
          </Field>
          <Field label="Roadmap Phase">
            <Select
              value={draft.roadmapPhase}
              onChange={(value) => setDraft({ ...draft, roadmapPhase: value })}
              options={roadmapOptions.map((value) => ({ value, label: value }))}
            />
          </Field>
        </div>
      ),
    },
    {
      key: 'financial',
      label: 'Financial / Portfolio',
      children: (
        <div className={styles.sectionGrid}>
          <Field label="Annual Cost">
            <InputNumber
              value={draft.annualCost ?? undefined}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  annualCost: typeof value === 'number' ? value : null,
                })
              }
            />
          </Field>
          <Field label="Vendor">
            <Input
              value={draft.vendor}
              onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
            />
          </Field>
          <Field label="Contract Expiry">
            <Input
              value={draft.contractExpiry}
              onChange={(e) =>
                setDraft({ ...draft, contractExpiry: e.target.value })
              }
            />
          </Field>
          <Field label="Licensing Model">
            <Select
              value={draft.licensingModel}
              onChange={(value) =>
                setDraft({ ...draft, licensingModel: value })
              }
              options={licensingOptions.map((value) => ({
                value,
                label: value,
              }))}
            />
          </Field>
          <Field label="Technical Debt Score">
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
          </Field>
        </div>
      ),
    },
    {
      key: 'operational',
      label: 'Operational Metrics',
      children: (
        <div className={styles.sectionGrid}>
          <Field label="SLA Level">
            <Select
              value={draft.slaLevel}
              onChange={(value) => setDraft({ ...draft, slaLevel: value })}
              options={slaOptions.map((value) => ({ value, label: value }))}
            />
          </Field>
          <Field label="Availability %">
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
          </Field>
          <Field label="Incident Rate">
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
          </Field>
          <Field label="Performance KPI">
            <Input
              value={draft.performanceKpi}
              onChange={(e) =>
                setDraft({ ...draft, performanceKpi: e.target.value })
              }
            />
          </Field>
        </div>
      ),
    },
    {
      key: 'compliance',
      label: 'Compliance & Security',
      children: (
        <div className={styles.sectionGrid}>
          <Field label="Data Classification">
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
          </Field>
          <Field label="Regulatory Impact">
            <Input
              value={draft.regulatoryImpact}
              onChange={(e) =>
                setDraft({ ...draft, regulatoryImpact: e.target.value })
              }
            />
          </Field>
          <Field label="Security Tier">
            <Select
              value={draft.securityTier}
              onChange={(value) => setDraft({ ...draft, securityTier: value })}
              options={securityOptions.map((value) => ({
                value,
                label: value,
              }))}
            />
          </Field>
          <Field label="Audit Status">
            <Select
              value={draft.auditStatus}
              onChange={(value) => setDraft({ ...draft, auditStatus: value })}
              options={auditOptions.map((value) => ({ value, label: value }))}
            />
          </Field>
        </div>
      ),
    },
    {
      key: 'documentation',
      label: 'Documentation',
      children: (
        <div className={styles.sectionGrid}>
          <Field label="Description">
            <TextArea
              rows={3}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </Field>
          <Field label="Assumptions">
            <TextArea
              rows={3}
              value={draft.assumptions}
              onChange={(e) =>
                setDraft({ ...draft, assumptions: e.target.value })
              }
            />
          </Field>
          <Field label="Constraints">
            <TextArea
              rows={3}
              value={draft.constraints}
              onChange={(e) =>
                setDraft({ ...draft, constraints: e.target.value })
              }
            />
          </Field>
          <Field label="Notes">
            <TextArea
              rows={3}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </Field>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.inspectorRoot}>
      <Collapse
        size="small"
        items={items}
        defaultActiveKey={['identity', 'governance']}
        className={styles.collapse}
        bordered={false}
      />
    </div>
  );
};

export default CatalogInspector;
