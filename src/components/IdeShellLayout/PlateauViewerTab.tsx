import React from 'react';
import { Alert, Button, Card, Descriptions, Empty, Space, Typography } from 'antd';
import { getPlateauById } from '../../../backend/roadmap/PlateauStore';
import type { Plateau } from '../../../backend/roadmap/Plateau';
import { getBaselineById } from '../../../backend/baselines/BaselineStore';
import { useIdeShell } from './index';

export type PlateauViewerTabProps = {
  plateauId: string;
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

const PlateauViewerTab: React.FC<PlateauViewerTabProps> = ({ plateauId }) => {
  const { openWorkspaceTab } = useIdeShell();
  const [plateau, setPlateau] = React.useState<Plateau | null>(() => getPlateauById(plateauId));
  const [baselineName, setBaselineName] = React.useState<string | null>(null);

  React.useEffect(() => {
    const p = getPlateauById(plateauId);
    setPlateau(p);
    if (p?.stateRef?.kind === 'baseline') {
      const b = getBaselineById(p.stateRef.baselineId);
      if (b?.name) setBaselineName(b.name);
      else setBaselineName(null);
    } else {
      setBaselineName(null);
    }
  }, [plateauId]);

  if (!plateau) {
    return (
      <div style={{ padding: 12 }}>
        <Alert
          showIcon
          type="warning"
          message="Plateau not found"
          description="The plateau id is missing or was deleted. Return to Explorer and open a valid plateau."
          style={{ marginBottom: 12 }}
        />
        <Empty description="No plateau available" />
      </div>
    );
  }

  const stateRefDesc = () => {
    if (!plateau.stateRef) return '-';
    if (plateau.stateRef.kind === 'baseline') {
      return baselineName ? `${baselineName} (${plateau.stateRef.baselineId})` : plateau.stateRef.baselineId;
    }
    return plateau.stateRef.label || 'External state';
  };

  return (
    <div style={{ padding: 12 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          showIcon
          type="info"
          message="Plateau - Read Only"
          description="Plateaus describe planned architecture states and reference frozen snapshots. Editing plateau content is not allowed."
        />

        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {plateau.name || 'Plateau'}
          </Typography.Title>
          <Typography.Text type="secondary">{plateau.description || 'No description provided.'}</Typography.Text>
        </div>

        <Card size="small" title="Plateau details">
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="Plateau id">{plateau.id}</Descriptions.Item>
            <Descriptions.Item label="Occurs at">{formatDateTime(plateau.occursAt)}</Descriptions.Item>
            <Descriptions.Item label="Created at">{formatDateTime(plateau.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="Created by">{plateau.createdBy || 'N/A'}</Descriptions.Item>
            <Descriptions.Item label="State reference">{stateRefDesc()}</Descriptions.Item>
            {plateau.stateRef?.kind === 'baseline' ? (
              <Descriptions.Item label="Actions">
                <Button type="link" onClick={() => openWorkspaceTab({ type: 'baseline', baselineId: plateau.stateRef.baselineId })}>
                  Open referenced baseline (read-only)
                </Button>
              </Descriptions.Item>
            ) : null}
          </Descriptions>
        </Card>
      </Space>
    </div>
  );
};

export default PlateauViewerTab;
