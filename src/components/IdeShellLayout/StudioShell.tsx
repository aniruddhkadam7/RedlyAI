import React from 'react';
import { Alert, Button, Collapse, Empty, Form, Input, Modal, Tag, Typography, message, theme } from 'antd';
import { useModel } from '@umijs/max';
import cytoscape, { type Core } from 'cytoscape';

import styles from './style.module.less';
import { OBJECT_TYPE_DEFINITIONS, RELATIONSHIP_TYPE_DEFINITIONS, type ObjectType, type RelationshipType } from '@/pages/dependency-view/utils/eaMetaModel';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import { useIdeShell } from './index';
import { defaultLifecycleStateForLifecycleCoverage } from '@/repository/lifecycleCoveragePolicy';
import { buildGovernanceDebt } from '@/ea/governanceValidation';

type StudioShellProps = {
  propertiesPanel: React.ReactNode;
  onExit: () => void;
};

const defaultIdPrefixForType = (type: ObjectType): string => {
  switch (type) {
    case 'Capability':
      return 'cap-';
    case 'Application':
      return 'app-';
    case 'Technology':
      return 'tech-';
    default:
      return `${String(type).toLowerCase()}-`;
  }
};

const generateUUID = (): string => {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

const generateElementId = (type: ObjectType): string => {
  return `${defaultIdPrefixForType(type)}${generateUUID()}`;
};

const StudioShell: React.FC<StudioShellProps> = ({ propertiesPanel, onExit }) => {
  const { token } = theme.useToken();
  const { initialState } = useModel('@@initialState');
  const { openPropertiesPanel } = useIdeShell();
  const { eaRepository, trySetEaRepository, metadata } = useEaRepository();
  const cyRef = React.useRef<Core | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [form] = Form.useForm<{ name: string; description?: string }>();

  const [pendingElementType, setPendingElementType] = React.useState<ObjectType | null>(null);
  const [placement, setPlacement] = React.useState<{ x: number; y: number } | null>(null);
  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [pendingRelationshipType, setPendingRelationshipType] = React.useState<RelationshipType | null>(null);
  const [relationshipSourceId, setRelationshipSourceId] = React.useState<string | null>(null);
  const [relationshipTargetId, setRelationshipTargetId] = React.useState<string | null>(null);
  const [relationshipPreviewOpen, setRelationshipPreviewOpen] = React.useState(false);
  const [auditPreviewOpen, setAuditPreviewOpen] = React.useState(false);
  const [pendingElementDraft, setPendingElementDraft] = React.useState<
    | {
        type: ObjectType;
        name: string;
        description: string;
        placement: { x: number; y: number } | null;
      }
    | null
  >(null);

  const paletteElements = React.useMemo(() => {
    const allowed = ['Capability', 'Application', 'Technology'] as const;
    return allowed
      .map((type) => OBJECT_TYPE_DEFINITIONS[type])
      .filter(Boolean);
  }, []);

  const paletteRelationships = React.useMemo(() => {
    const allowed = ['SUPPORTS', 'DEPENDS_ON', 'COMPOSED_OF'] as const;
    return allowed
      .map((type) => RELATIONSHIP_TYPE_DEFINITIONS[type])
      .filter(Boolean);
  }, []);

  React.useEffect(() => {
    if (!containerRef.current) return undefined;

    if (!cyRef.current) {
      cyRef.current = cytoscape({
        container: containerRef.current,
        elements: [],
        layout: { name: 'grid', fit: true, avoidOverlap: true } as const,
        style: [
          {
            selector: 'node',
            style: {
              label: 'data(label)',
              'text-valign': 'center',
              'text-halign': 'center',
              'background-color': '#f0f0f0',
              color: '#1f1f1f',
              'border-color': '#d9d9d9',
              'border-width': 1,
              'font-size': 11,
              'font-weight': 600,
              width: 120,
              height: 48,
              shape: 'round-rectangle',
            },
          },
          {
            selector: 'edge',
            style: {
              width: 1.5,
              'line-color': '#8c8c8c',
              'target-arrow-color': '#8c8c8c',
              'target-arrow-shape': 'vee',
              'curve-style': 'bezier',
              label: 'data(relationshipType)',
              'font-size': 8,
              'text-background-color': '#fff',
              'text-background-opacity': 0.7,
              'text-rotation': 'autorotate',
            },
          },
        ],
        userZoomingEnabled: true,
        userPanningEnabled: true,
        boxSelectionEnabled: true,
        autounselectify: false,
        autoungrabify: false,
      });
    }

    const handleTap = (evt: any) => {
      if (!cyRef.current) return;

      if (pendingElementType && evt.target === cyRef.current) {
        const pos = evt.position ?? evt.cyPosition ?? { x: 0, y: 0 };
        setPlacement({ x: pos.x, y: pos.y });
        setCreateModalOpen(true);
        openPropertiesPanel({ dock: 'right' });
        return;
      }

      if (pendingRelationshipType && evt.target !== cyRef.current) {
        const node = evt.target;
        const id = String(node.id());
        if (!id) return;

        if (!relationshipSourceId) {
          setRelationshipSourceId(id);
          return;
        }

        if (relationshipSourceId === id) return;

        const sourceObj = eaRepository?.objects.get(relationshipSourceId);
        const targetObj = eaRepository?.objects.get(id);
        if (!sourceObj || !targetObj) return;

        const relDef = RELATIONSHIP_TYPE_DEFINITIONS[pendingRelationshipType];
        if (!relDef) return;

        const fromType = sourceObj.type;
        const toType = targetObj.type;
        const pairs = relDef.allowedEndpointPairs ?? [];

        const valid =
          (Array.isArray(pairs) && pairs.length > 0
            ? pairs.some((p) => p.from === fromType && p.to === toType)
            : relDef.fromTypes.includes(fromType) && relDef.toTypes.includes(toType));

        if (!valid) {
          // Reject invalid combinations silently.
          setRelationshipSourceId(null);
          setRelationshipTargetId(null);
          return;
        }

        setRelationshipTargetId(id);
        setRelationshipPreviewOpen(true);
      }
    };

    cyRef.current.on('tap', handleTap);

    return () => {
      cyRef.current?.removeListener('tap', handleTap);
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [eaRepository, openPropertiesPanel, pendingElementType, pendingRelationshipType, relationshipSourceId]);

  const actor =
    initialState?.currentUser?.name || initialState?.currentUser?.userid || 'studio';

  const handleExit = React.useCallback(() => {
    setPendingElementType(null);
    setPlacement(null);
    setCreateModalOpen(false);
    setAuditPreviewOpen(false);
    setPendingElementDraft(null);
    setPendingRelationshipType(null);
    setRelationshipSourceId(null);
    setRelationshipTargetId(null);
    setRelationshipPreviewOpen(false);
    form.resetFields();
    onExit();
  }, [form, onExit]);

  const relationshipSourceLabel = React.useMemo(() => {
    if (!relationshipSourceId || !eaRepository) return '—';
    const obj = eaRepository.objects.get(relationshipSourceId);
    if (!obj) return relationshipSourceId;
    const name = (obj.attributes as any)?.name;
    return typeof name === 'string' && name.trim()
      ? `${name} (${obj.type})`
      : `${relationshipSourceId} (${obj.type})`;
  }, [eaRepository, relationshipSourceId]);

  const relationshipTargetLabel = React.useMemo(() => {
    if (!relationshipTargetId || !eaRepository) return '—';
    const obj = eaRepository.objects.get(relationshipTargetId);
    if (!obj) return relationshipTargetId;
    const name = (obj.attributes as any)?.name;
    return typeof name === 'string' && name.trim()
      ? `${name} (${obj.type})`
      : `${relationshipTargetId} (${obj.type})`;
  }, [eaRepository, relationshipTargetId]);

  const governance = React.useMemo(() => {
    if (!eaRepository) return null;
    try {
      return buildGovernanceDebt(eaRepository, new Date(), {
        lifecycleCoverage: metadata?.lifecycleCoverage ?? null,
        governanceMode: metadata?.governanceMode ?? null,
      });
    } catch {
      return null;
    }
  }, [eaRepository, metadata?.governanceMode, metadata?.lifecycleCoverage]);

  const validationSummary = React.useMemo(() => {
    if (!governance) return null;
    const repoFindings = governance.repoReport.findings ?? [];
    const relFindings = governance.relationshipReport.findings ?? [];
    const errors = [...repoFindings, ...relFindings].filter((f) => f.severity === 'Error');
    const warnings = [...repoFindings, ...relFindings].filter((f) => f.severity === 'Warning');
    const extraErrors = (governance.invalidRelationshipInserts?.length ?? 0) + (governance.lifecycleTagMissingIds?.length ?? 0);

    return {
      errorCount: errors.length + extraErrors,
      warningCount: warnings.length,
      errorHighlights: errors.slice(0, 3).map((f) => f.message),
      warningHighlights: warnings.slice(0, 3).map((f) => f.message),
    };
  }, [governance]);

  return (
    <div className={styles.studioShell} style={{ borderColor: token.colorWarningBorder }}>
      <div className={styles.studioHeader} style={{ background: token.colorWarningBg, borderColor: token.colorWarningBorder }}>
        <div>
          <Typography.Text strong>Architecture Studio</Typography.Text>
          <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            Modeling workspace (explicit changes only)
          </Typography.Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag color="gold">Studio Mode</Tag>
          <Button size="small" danger onClick={handleExit}>
            Exit Studio
          </Button>
        </div>
      </div>

      <div className={styles.studioColumns}>
        <div className={styles.studioLeft}>
          <Typography.Text strong>Modeling Palette</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
            Element and relationship types only. No free shapes.
          </Typography.Paragraph>

          <Collapse
            bordered
            size="small"
            defaultActiveKey={['elements', 'relationships']}
            items={[
              {
                key: 'elements',
                label: 'Elements (explicit actions)',
                children: (
                  <div className={styles.studioPaletteList}>
                          {paletteElements.map((t) => (
                            <button
                              key={t.type}
                              type="button"
                              className={styles.studioPaletteItemButton}
                              onClick={() => {
                                setPendingElementType(t.type as ObjectType);
                                setPendingRelationshipType(null);
                                setRelationshipSourceId(null);
                                setRelationshipTargetId(null);
                                message.info(`Create ${t.type}: click the canvas to place.`);
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <Typography.Text>Create {t.type}</Typography.Text>
                                <Tag color="default" style={{ marginInlineStart: 0 }}>
                                  {t.layer}
                                </Tag>
                              </div>
                              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                {t.description}
                              </Typography.Text>
                            </button>
                          ))}
                  </div>
                ),
              },
              {
                key: 'relationships',
                label: 'Relationships (explicit actions)',
                children: (
                  <div className={styles.studioPaletteList}>
                    {paletteRelationships.map((t) => (
                      <button
                        key={t.type}
                        type="button"
                        className={styles.studioPaletteItemButton}
                        onClick={() => {
                          setPendingRelationshipType(t.type as RelationshipType);
                          setPendingElementType(null);
                          setRelationshipSourceId(null);
                          setRelationshipTargetId(null);
                          message.info(`Create ${t.type.replace(/_/g, ' ')}: select source then target.`);
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <Typography.Text>Create {t.type.replace(/_/g, ' ')}</Typography.Text>
                          <Tag color="default" style={{ marginInlineStart: 0 }}>
                            {t.layer}
                          </Tag>
                        </div>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          {t.description}
                        </Typography.Text>
                      </button>
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </div>

        <div className={styles.studioCenter}>
          <Alert
            type="warning"
            showIcon
            message="Studio canvas"
            description="Cytoscape workspace for explicit modeling. No implicit creation or inferred relationships."
            style={{ marginBottom: 8 }}
          />
          <div className={styles.studioCanvas}>
            <div ref={containerRef} className={styles.studioCanvasSurface} />
            {validationSummary && (validationSummary.errorCount > 0 || validationSummary.warningCount > 0) && (
              <div className={styles.studioCanvasOverlay}>
                {validationSummary.errorCount > 0 && (
                  <Alert
                    type="error"
                    showIcon
                    message={`Blocking errors: ${validationSummary.errorCount}`}
                    description={
                      validationSummary.errorHighlights.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {validationSummary.errorHighlights.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      ) : null
                    }
                  />
                )}
                {validationSummary.warningCount > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    message={`Advisory warnings: ${validationSummary.warningCount}`}
                    description={
                      validationSummary.warningHighlights.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {validationSummary.warningHighlights.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      ) : null
                    }
                  />
                )}
              </div>
            )}
            <div className={styles.studioCanvasHint}>
              <Typography.Text type="secondary">
                Placement-only canvas: move/select for alignment & grouping. No freehand drawing or anonymous shapes.
              </Typography.Text>
            </div>
          </div>
        </div>

        <div className={styles.studioRight}>
          <div className={styles.studioRightSection}>
            <Typography.Text strong>Properties</Typography.Text>
            <div className={styles.studioRightBody}>
              {validationSummary && (validationSummary.errorCount > 0 || validationSummary.warningCount > 0) && (
                <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
                  {validationSummary.errorCount > 0 && (
                    <Alert type="error" showIcon message={`Blocking errors: ${validationSummary.errorCount}`} />
                  )}
                  {validationSummary.warningCount > 0 && (
                    <Alert type="warning" showIcon message={`Advisory warnings: ${validationSummary.warningCount}`} />
                  )}
                </div>
              )}
              {propertiesPanel}
            </div>
          </div>

          <div className={styles.studioRightSection}>
            <Typography.Text strong>Validation messages</Typography.Text>
            <div className={styles.studioRightBody}>
              {validationSummary && (validationSummary.errorCount > 0 || validationSummary.warningCount > 0) ? (
                <div className={styles.studioValidationList}>
                  {validationSummary.errorHighlights.map((m) => (
                    <Alert key={`err:${m}`} type="error" showIcon message={m} />
                  ))}
                  {validationSummary.warningHighlights.map((m) => (
                    <Alert key={`warn:${m}`} type="warning" showIcon message={m} />
                  ))}
                </div>
              ) : (
                <Empty description="No validation messages yet" />
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={createModalOpen}
        title={pendingElementType ? `Confirm ${pendingElementType} creation` : 'Confirm creation'}
        okText="Create"
        cancelText="Cancel"
        onCancel={() => {
          setCreateModalOpen(false);
          setPendingElementType(null);
          setPlacement(null);
          form.resetFields();
        }}
        onOk={async () => {
          if (!pendingElementType) return;
          if (!eaRepository) return;
          try {
            const values = await form.validateFields();
            const name = String(values.name || '').trim();
            if (!name) {
              message.error('Name is required.');
              return;
            }

            setPendingElementDraft({
              type: pendingElementType,
              name,
              description: String(values.description || '').trim(),
              placement,
            });
            setAuditPreviewOpen(true);
          } catch {
            // validation errors handled by Form
          }
        }}
      >
        <Alert
          type="warning"
          showIcon
          message="Creation is explicit"
          description="The element will not be created until you confirm."
          style={{ marginBottom: 12 }}
        />
        <Form form={form} layout="vertical">
          <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="Enter name" autoFocus allowClear />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea placeholder="Optional description" rows={3} allowClear />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={auditPreviewOpen}
        title="Audit & Impact Preview"
        okText="Confirm and create"
        cancelText="Cancel"
        onCancel={() => {
          setAuditPreviewOpen(false);
          setPendingElementDraft(null);
        }}
        onOk={() => {
          if (!pendingElementDraft || !eaRepository) return;

          const id = generateElementId(pendingElementDraft.type);
          const createdAt = new Date().toISOString();
          const lifecycleState = defaultLifecycleStateForLifecycleCoverage(metadata?.lifecycleCoverage ?? null);

          const next = eaRepository.clone();
          const res = next.addObject({
            id,
            type: pendingElementDraft.type,
            attributes: {
              name: pendingElementDraft.name,
              description: pendingElementDraft.description,
              elementType: pendingElementDraft.type,
              createdBy: actor,
              createdAt,
              lastModifiedAt: createdAt,
              lastModifiedBy: actor,
              lifecycleState,
              ...(metadata?.architectureScope === 'Domain'
                ? { domainId: (metadata?.repositoryName ?? '').trim() || 'domain' }
                : {}),
            },
          });

          if (!res.ok) {
            message.error(res.error);
            return;
          }

          const applied = trySetEaRepository(next);
          if (!applied.ok) return;

          if (cyRef.current && pendingElementDraft.placement) {
            cyRef.current.add({
              data: { id, label: pendingElementDraft.name, elementType: pendingElementDraft.type },
              position: { x: pendingElementDraft.placement.x, y: pendingElementDraft.placement.y },
            });
          }

          setAuditPreviewOpen(false);
          setCreateModalOpen(false);
          setPendingElementType(null);
          setPlacement(null);
          setPendingElementDraft(null);
          form.resetFields();
          openPropertiesPanel({ elementId: id, elementType: pendingElementDraft.type, dock: 'right', readOnly: false });
          message.success(`${pendingElementDraft.type} created.`);
        }}
      >
        <Typography.Text strong>Elements to be created</Typography.Text>
        <ul style={{ marginTop: 6, paddingLeft: 18 }}>
          <li>
            {pendingElementDraft
              ? `${pendingElementDraft.type}: ${pendingElementDraft.name || '(unnamed)'}`
              : '—'}
          </li>
        </ul>
        <Typography.Text strong>Relationships affected</Typography.Text>
        <ul style={{ marginTop: 6, paddingLeft: 18 }}>
          <li>None (no relationships will be created).</li>
        </ul>
        <Typography.Text strong>Impact summary</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ marginTop: 6 }}>
          New element will be added to the repository. No relationships are created in this step.
        </Typography.Paragraph>
      </Modal>

      <Modal
        open={relationshipPreviewOpen}
        title="Confirm relationship"
        okText="Create"
        cancelText="Cancel"
        onCancel={() => {
          setRelationshipPreviewOpen(false);
          setRelationshipSourceId(null);
          setRelationshipTargetId(null);
        }}
        onOk={() => {
          if (!pendingRelationshipType || !relationshipSourceId || !relationshipTargetId || !eaRepository) return;

          const next = eaRepository.clone();
          const createdAt = new Date().toISOString();
          const relationshipId = `rel-${generateUUID()}`;

          const res = next.addRelationship({
            id: relationshipId,
            fromId: relationshipSourceId,
            toId: relationshipTargetId,
            type: pendingRelationshipType,
            attributes: {
              createdAt,
              createdBy: actor,
              lastModifiedAt: createdAt,
              lastModifiedBy: actor,
            },
          });

          if (!res.ok) {
            // Reject invalid combinations silently.
            setRelationshipPreviewOpen(false);
            setRelationshipSourceId(null);
            setRelationshipTargetId(null);
            return;
          }

          const applied = trySetEaRepository(next);
          if (!applied.ok) return;

          if (cyRef.current) {
            cyRef.current.add({
              data: {
                id: relationshipId,
                source: relationshipSourceId,
                target: relationshipTargetId,
                relationshipType: pendingRelationshipType,
              },
            });
          }

          setRelationshipPreviewOpen(false);
          setRelationshipSourceId(null);
          setRelationshipTargetId(null);
          setPendingRelationshipType(null);
          message.success('Relationship created.');
        }}
      >
        <Alert
          type="warning"
          showIcon
          message="Audit & Impact Preview"
          description="The relationship will not be created until you confirm."
          style={{ marginBottom: 12 }}
        />
        <Typography.Text strong>Elements to be modified</Typography.Text>
        <ul style={{ marginTop: 6, paddingLeft: 18 }}>
          <li>{relationshipSourceLabel}</li>
          <li>{relationshipTargetLabel}</li>
        </ul>
        <Typography.Text strong>Relationships affected</Typography.Text>
        <ul style={{ marginTop: 6, paddingLeft: 18 }}>
          <li>
            {pendingRelationshipType?.replace(/_/g, ' ')}: {relationshipSourceLabel} → {relationshipTargetLabel}
          </li>
        </ul>
        <Typography.Text strong>Impact summary</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ marginTop: 6 }}>
          Adds an explicit relationship between the selected elements. No additional elements will be created.
        </Typography.Paragraph>
      </Modal>
    </div>
  );
};

export default StudioShell;
