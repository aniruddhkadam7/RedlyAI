import {
  Alert,
  Button,
  Card,
  Empty,
  List,
  Space,
  Tag,
  Typography,
  theme,
} from 'antd';
import React from 'react';
import { useAppTheme } from '@/theme/ThemeContext';
import { getBaselineById } from '../../../backend/baselines/BaselineStore';
import type { BaseArchitectureElement } from '../../../backend/repository/BaseArchitectureElement';
import { computeGapBetweenPlateaus } from '../../../backend/roadmap/Gap';
import type { Plateau } from '../../../backend/roadmap/Plateau';
import { listPlateaus } from '../../../backend/roadmap/PlateauStore';
import type { Roadmap } from '../../../backend/roadmap/Roadmap';
import { getRoadmapById } from '../../../backend/roadmap/RoadmapStore';
import { useIdeShell } from './index';

export type RoadmapViewerTabProps = {
  roadmapId: string;
};

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString();
  } catch {
    return value;
  }
};

const RoadmapViewerTab: React.FC<RoadmapViewerTabProps> = ({ roadmapId }) => {
  const { openWorkspaceTab } = useIdeShell();
  const { token } = theme.useToken();
  const { isDark } = useAppTheme();

  const borderColor = token.colorBorder;
  const sectionBg = isDark ? token.colorBgElevated : token.colorFillQuaternary;
  const subtleText = token.colorTextTertiary;

  const [roadmap, setRoadmap] = React.useState<Roadmap | null>(() =>
    getRoadmapById(roadmapId),
  );
  const [plateaus, setPlateaus] = React.useState<readonly Plateau[]>(() =>
    listPlateaus(),
  );

  React.useEffect(() => {
    setRoadmap(getRoadmapById(roadmapId));
    setPlateaus(listPlateaus());
  }, [roadmapId]);

  const plateauById = React.useMemo(() => {
    const map = new Map<string, Plateau>();
    for (const p of plateaus) map.set(p.id, p);
    return map;
  }, [plateaus]);

  const roadmapPlateauIds = roadmap?.plateauIds ?? [];

  const orderedPlateaus: Plateau[] = React.useMemo(() => {
    return roadmapPlateauIds
      .map((id) => plateauById.get(id))
      .filter((p): p is Plateau => Boolean(p));
  }, [plateauById, roadmapPlateauIds]);

  const missingPlateauIds = roadmapPlateauIds.filter(
    (id) => !plateauById.has(id),
  );

  const plateauStates: Array<{
    plateau: Plateau;
    elements: readonly BaseArchitectureElement[];
  }> = React.useMemo(() => {
    return orderedPlateaus.map((p) => {
      if (p.stateRef?.kind === 'baseline') {
        const baseline = getBaselineById(p.stateRef.baselineId);
        return { plateau: p, elements: baseline?.elements ?? [] };
      }
      return { plateau: p, elements: [] };
    });
  }, [orderedPlateaus]);

  const elementOrder: string[] = React.useMemo(() => {
    const order: string[] = [];
    const seen = new Set<string>();
    for (const state of plateauStates) {
      for (const el of state.elements) {
        const id = String(el.id || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        order.push(id);
      }
    }
    return order;
  }, [plateauStates]);

  const elementMeta = React.useMemo(() => {
    const meta = new Map<string, { name: string; type?: string }>();
    for (const state of plateauStates) {
      for (const el of state.elements) {
        const id = String(el.id || '').trim();
        if (!id) continue;
        if (meta.has(id)) continue;
        const name =
          typeof (el as any)?.name === 'string' && (el as any).name.trim()
            ? (el as any).name.trim()
            : id;
        meta.set(id, { name, type: (el as any)?.type as string | undefined });
      }
    }
    return meta;
  }, [plateauStates]);

  const presenceRows = React.useMemo(() => {
    return elementOrder.map((id) => {
      const meta = elementMeta.get(id);
      const presence = plateauStates.map((state) =>
        state.elements.some((el) => String(el.id || '').trim() === id),
      );
      return { id, name: meta?.name ?? id, type: meta?.type, presence };
    });
  }, [elementMeta, elementOrder, plateauStates]);

  const gapResults = React.useMemo(() => {
    const results = [] as Array<ReturnType<typeof computeGapBetweenPlateaus>>;
    for (let i = 0; i < plateauStates.length - 1; i += 1) {
      const from = plateauStates[i]?.plateau.id;
      const to = plateauStates[i + 1]?.plateau.id;
      results.push(computeGapBetweenPlateaus(from, to));
    }
    return results;
  }, [plateauStates]);

  if (!roadmap) {
    return (
      <div style={{ padding: 12 }}>
        <Alert
          showIcon
          type="warning"
          message="Roadmap not found"
          description="Open a valid roadmap from Explorer. Roadmaps are read-only projections over plateaus."
          style={{ marginBottom: 12 }}
        />
        <Empty description="No roadmap available" />
      </div>
    );
  }

  const displayName = (
    el: BaseArchitectureElement | null | undefined,
    fallback: string,
  ) => {
    if (!el) return fallback;
    const rawName = (el as any)?.name;
    if (typeof rawName === 'string' && rawName.trim()) return rawName.trim();
    return fallback;
  };

  return (
    <div style={{ padding: 12 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          showIcon
          type="info"
          message="Roadmap - Read Only"
          description="Roadmaps visualize the architectural evolution as an ordered sequence of plateaus. They do not own or mutate architecture elements."
        />

        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {roadmap.name}
          </Typography.Title>
          <Typography.Text type="secondary">
            {roadmap.description || 'No description provided.'}
          </Typography.Text>
        </div>

        <Card size="small" title="Roadmap metadata">
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Typography.Text type="secondary">Roadmap id</Typography.Text>
            <Typography.Text code>{roadmap.id}</Typography.Text>
            <Typography.Text type="secondary">Created at</Typography.Text>
            <Typography.Text>
              {formatDateTime(roadmap.createdAt)}
            </Typography.Text>
            {roadmap.createdBy ? (
              <>
                <Typography.Text type="secondary">Created by</Typography.Text>
                <Typography.Text>{roadmap.createdBy}</Typography.Text>
              </>
            ) : null}
          </Space>
        </Card>

        <Card
          size="small"
          title="Timeline"
          extra={<Tag color="blue">Horizontal progression</Tag>}
        >
          {orderedPlateaus.length === 0 ? (
            <Empty description="No plateaus in this roadmap." />
          ) : (
            <div
              style={{
                display: 'flex',
                gap: 12,
                overflowX: 'auto',
                paddingBottom: 8,
              }}
            >
              {plateauStates.map((state, idx) => (
                <Card
                  key={state.plateau.id}
                  size="small"
                  style={{
                    minWidth: 220,
                    flex: '0 0 auto',
                    border: `1px solid ${borderColor}`,
                    background: sectionBg,
                  }}
                  title={
                    <Space size={8} align="baseline">
                      <Tag color="blue">{idx + 1}</Tag>
                      <Typography.Text strong>
                        {state.plateau.name}
                      </Typography.Text>
                    </Space>
                  }
                  extra={<Tag>{formatDateTime(state.plateau.occursAt)}</Tag>}
                >
                  <Space
                    direction="vertical"
                    size={6}
                    style={{ width: '100%' }}
                  >
                    <Typography.Text type="secondary">
                      {state.plateau.stateRef?.kind === 'baseline'
                        ? `Baseline • ${state.plateau.stateRef.baselineId}`
                        : state.plateau.stateRef?.label || 'External state'}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      Elements: {state.elements.length}
                    </Typography.Text>
                    <Button
                      type="link"
                      onClick={() =>
                        openWorkspaceTab({
                          type: 'plateau',
                          plateauId: state.plateau.id,
                        })
                      }
                    >
                      Open plateau
                    </Button>
                  </Space>
                </Card>
              ))}
            </div>
          )}
          {missingPlateauIds.length > 0 ? (
            <Alert
              showIcon
              type="warning"
              message="Missing plateaus"
              description={`The following plateau ids are referenced but not found: ${missingPlateauIds.join(', ')}`}
              style={{ marginTop: 12 }}
            />
          ) : null}
        </Card>

        <Card
          size="small"
          title="Element presence across plateaus"
          extra={<Tag color="purple">Read-only</Tag>}
        >
          {elementOrder.length === 0 ? (
            <Empty description="No elements available from referenced plateaus." />
          ) : (
            <div
              style={{
                overflowX: 'auto',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `220px repeat(${plateauStates.length}, minmax(140px, 1fr))`,
                  gap: 0,
                  alignItems: 'center',
                  minWidth:
                    plateauStates.length > 0
                      ? 220 + plateauStates.length * 140
                      : 220,
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    padding: '6px 8px',
                    borderBottom: `2px solid ${borderColor}`,
                    background: sectionBg,
                  }}
                >
                  Element
                </div>
                {plateauStates.map((state) => (
                  <div
                    key={`hdr-${state.plateau.id}`}
                    style={{
                      fontWeight: 600,
                      textAlign: 'center',
                      padding: '6px 8px',
                      borderBottom: `2px solid ${borderColor}`,
                      borderLeft: `1px solid ${borderColor}`,
                      background: sectionBg,
                    }}
                  >
                    {state.plateau.name}
                  </div>
                ))}

                {presenceRows.map((row) => (
                  <React.Fragment key={row.id}>
                    <div
                      style={{
                        padding: '4px 8px',
                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      <Typography.Text strong>{row.name}</Typography.Text>
                      {row.type ? (
                        <Typography.Text
                          type="secondary"
                          style={{ display: 'block', fontSize: 12 }}
                        >
                          {row.type}
                        </Typography.Text>
                      ) : null}
                    </div>
                    {row.presence.map((present, idx) => (
                      <div
                        key={`${row.id}-${idx}`}
                        style={{
                          textAlign: 'center',
                          padding: '4px 8px',
                          borderBottom: `1px solid ${token.colorBorderSecondary}`,
                          borderLeft: `1px solid ${borderColor}`,
                        }}
                      >
                        {present ? (
                          <Tag color="green">Present</Tag>
                        ) : (
                          <Typography.Text type="secondary">—</Typography.Text>
                        )}
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
          <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
            Presence is derived from referenced baselines. External plateau
            references do not contribute element lists. This visualization is
            read-only.
          </Typography.Paragraph>
        </Card>

        <Card
          size="small"
          title="Gap Analysis"
          extra={<Tag color="red">Computed</Tag>}
        >
          {gapResults.length === 0 ? (
            <Empty description="Add at least two plateaus to view gaps." />
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              {gapResults.map((gap, idx) => {
                const fromLabel =
                  plateauById.get(gap.fromPlateauId)?.name ?? gap.fromPlateauId;
                const toLabel =
                  plateauById.get(gap.toPlateauId)?.name ?? gap.toPlateauId;

                const renderElementList = (
                  items: typeof gap.addedElements,
                  label: string,
                  color: string,
                ) => (
                  <div>
                    <Typography.Text strong>{label}</Typography.Text>
                    {items.length === 0 ? (
                      <Typography.Text
                        type="secondary"
                        style={{ marginLeft: 8 }}
                      >
                        None
                      </Typography.Text>
                    ) : (
                      <List
                        size="small"
                        dataSource={items}
                        renderItem={(item) => (
                          <List.Item>
                            <Space>
                              <Tag color={color}>{item.id}</Tag>
                              <span>
                                {displayName(item.to || item.from, item.id)}
                              </span>
                            </Space>
                          </List.Item>
                        )}
                      />
                    )}
                  </div>
                );

                const renderRelationshipList = (
                  items: typeof gap.addedRelationships,
                  label: string,
                  color: string,
                ) => (
                  <div>
                    <Typography.Text strong>{label}</Typography.Text>
                    {items.length === 0 ? (
                      <Typography.Text
                        type="secondary"
                        style={{ marginLeft: 8 }}
                      >
                        None
                      </Typography.Text>
                    ) : (
                      <List
                        size="small"
                        dataSource={items}
                        renderItem={(item) => (
                          <List.Item>
                            <Space>
                              <Tag color={color}>{item.id}</Tag>
                              <span>
                                {item.to ? 'Updated/Added' : 'Removed'}{' '}
                                relationship
                              </span>
                            </Space>
                          </List.Item>
                        )}
                      />
                    )}
                  </div>
                );

                return (
                  <Card
                    key={`${gap.fromPlateauId}-${gap.toPlateauId}`}
                    size="small"
                    title={
                      <Space>
                        <Tag>{idx + 1}</Tag>
                        <span>{fromLabel}</span>
                        <span style={{ color: subtleText }}>→</span>
                        <span>{toLabel}</span>
                      </Space>
                    }
                  >
                    <Space
                      direction="vertical"
                      size={8}
                      style={{ width: '100%' }}
                    >
                      {gap.warnings.length > 0 ? (
                        <Alert
                          showIcon
                          type="warning"
                          message="Gap computed with warnings"
                          description={gap.warnings.join('\n')}
                        />
                      ) : null}

                      <Space size={12} wrap>
                        <Tag color="green">
                          Added elements: {gap.addedElements.length}
                        </Tag>
                        <Tag color="red">
                          Removed elements: {gap.removedElements.length}
                        </Tag>
                        <Tag color="orange">
                          Changed elements: {gap.changedElements.length}
                        </Tag>
                        <Tag color="green">
                          Added rels: {gap.addedRelationships.length}
                        </Tag>
                        <Tag color="red">
                          Removed rels: {gap.removedRelationships.length}
                        </Tag>
                        <Tag color="orange">
                          Changed rels: {gap.changedRelationships.length}
                        </Tag>
                      </Space>

                      {renderElementList(
                        gap.addedElements,
                        'Added elements',
                        'green',
                      )}
                      {renderElementList(
                        gap.removedElements,
                        'Removed elements',
                        'red',
                      )}
                      {renderElementList(
                        gap.changedElements,
                        'Changed elements',
                        'orange',
                      )}
                      {renderRelationshipList(
                        gap.addedRelationships,
                        'Added relationships',
                        'green',
                      )}
                      {renderRelationshipList(
                        gap.removedRelationships,
                        'Removed relationships',
                        'red',
                      )}
                      {renderRelationshipList(
                        gap.changedRelationships,
                        'Changed relationships',
                        'orange',
                      )}
                    </Space>
                  </Card>
                );
              })}
            </Space>
          )}
        </Card>
      </Space>
    </div>
  );
};

export default RoadmapViewerTab;
