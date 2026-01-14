import React from 'react';
import { useModel } from '@umijs/max';
import { Button, Form, Input, Select, Table, Tag, message } from 'antd';

import { dispatchIdeCommand } from '@/ide/ideCommands';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import { ENABLE_RBAC, REPOSITORY_ROLES, assertRbacEnabled, type RepositoryRole, type RepositoryRoleBinding } from '@/repository/accessControl';
import { recordAuditEvent } from '@/repository/auditLog';

const SettingsPanel: React.FC = () => {
  const { initialState } = useModel('@@initialState');
  const { metadata } = useEaRepository();

  const userRole: RepositoryRole = React.useMemo(() => {
    if (!ENABLE_RBAC) return 'Owner';
    const access = initialState?.currentUser?.access;
    if (access === 'admin') return 'Owner';
    if (access === 'architect' || access === 'user') return 'Architect';
    return 'Viewer';
  }, [initialState?.currentUser?.access]);

  const storageKey = React.useMemo(() => {
    if (!metadata?.repositoryName) return null;
    return `ea.rbac.bindings.${metadata.repositoryName}`;
  }, [metadata?.repositoryName]);

  const ownerBinding: RepositoryRoleBinding | null = metadata?.owner
    ? { userId: metadata.owner.userId, role: 'Owner' }
    : null;

  const [roleBindings, setRoleBindings] = React.useState<RepositoryRoleBinding[]>(() => {
    try {
      if (!storageKey) return ownerBinding ? [ownerBinding] : [];
      const raw = localStorage.getItem(storageKey);
      if (!raw) return ownerBinding ? [ownerBinding] : [];
      const parsed = JSON.parse(raw) as RepositoryRoleBinding[];
      const dedup = new Map<string, RepositoryRoleBinding>();
      for (const b of parsed) {
        if (!b?.userId || !b?.role) continue;
        dedup.set(b.userId, { userId: b.userId, role: b.role });
      }
      if (ownerBinding) dedup.set(ownerBinding.userId, ownerBinding);
      return Array.from(dedup.values());
    } catch {
      return ownerBinding ? [ownerBinding] : [];
    }
  });

  const persistBindings = React.useCallback(
    (next: RepositoryRoleBinding[]) => {
      try {
        assertRbacEnabled('role bindings persistence');
      } catch (err: any) {
        message.error(err?.message || 'RBAC is disabled.');
        return;
      }

      setRoleBindings(next);
      if (!storageKey) return;
      try {
        const filtered = next.filter((b) => b.userId !== ownerBinding?.userId);
        localStorage.setItem(storageKey, JSON.stringify(filtered));
      } catch {
        // Best-effort persistence.
      }
    },
    [storageKey, ownerBinding?.userId],
  );

  const [form] = Form.useForm<{ userId: string; role: RepositoryRole }>();

  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Settings</div>
      <div style={{ opacity: 0.75, marginBottom: 12 }}>
        Workspace-level preferences and layout controls.
      </div>

      {!ENABLE_RBAC ? (
        <Tag color="default" style={{ alignSelf: 'flex-start' }}>
          Single-user mode (RBAC disabled)
        </Tag>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <a
          onClick={() => {
            dispatchIdeCommand({ type: 'view.resetLayout' });
            message.success('Layout reset.');
          }}
        >
          Reset layout
        </a>
        <a
          onClick={() => {
            dispatchIdeCommand({ type: 'view.toggleBottomPanel' });
          }}
        >
          Toggle bottom panel
        </a>
        <a
          onClick={() => {
            dispatchIdeCommand({ type: 'view.fullscreen.toggle' });
          }}
        >
          Toggle fullscreen workspace
        </a>
      </div>

      {ENABLE_RBAC && userRole === 'Owner' ? (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Access Control</div>
          <div style={{ opacity: 0.75, marginBottom: 12 }}>Manage repository roles. Owners only.</div>

          <Table
            size="small"
            pagination={false}
            rowKey={(row) => row.userId}
            dataSource={roleBindings}
            columns={[
              {
                title: 'User',
                dataIndex: 'userId',
              },
              {
                title: 'Role',
                dataIndex: 'role',
                render: (role: RepositoryRole) => <Tag color={role === 'Owner' ? 'geekblue' : role === 'Architect' ? 'green' : 'default'}>{role}</Tag>,
              },
              {
                title: 'Actions',
                render: (_: unknown, record) => {
                  if (record.role === 'Owner') return <span style={{ color: '#999' }}>Owner</span>;
                  return (
                    <a
                      onClick={() => {
                        try {
                          assertRbacEnabled('role removal');
                        } catch (err: any) {
                          message.error(err?.message || 'RBAC is disabled.');
                          return;
                        }
                        if (record.userId === ownerBinding?.userId) {
                          message.error('At least one Owner is required per repository.');
                          return;
                        }
                        const next = roleBindings.filter((b) => b.userId !== record.userId);
                        persistBindings(next);
                        if (metadata?.repositoryName) {
                          recordAuditEvent({
                            userId: actor,
                            action: `Removed user ${record.userId} role`,
                            repositoryName: metadata.repositoryName,
                          });
                        }
                        message.success('User removed.');
                      }}
                    >
                      Remove
                    </a>
                  );
                },
              },
            ]}
          />

          <Form
            form={form}
            layout="inline"
            style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}
            onFinish={(values) => {
              try {
                assertRbacEnabled('role assignment');
              } catch (err: any) {
                message.error(err?.message || 'RBAC is disabled.');
                return;
              }
              const userId = values.userId.trim();
              if (!userId) {
                message.error('User id is required.');
                return;
              }
              if (userId === ownerBinding?.userId) {
                message.error('At least one Owner is required per repository.');
                return;
              }
              const next = roleBindings.filter((b) => b.userId !== userId).concat({ userId, role: values.role });
              persistBindings(next);
              if (metadata?.repositoryName) {
                recordAuditEvent({
                  userId: actor,
                  action: `Assigned ${values.role} to ${userId}`,
                  repositoryName: metadata.repositoryName,
                });
              }
              form.resetFields();
              message.success('Role assigned.');
            }}
          >
            <Form.Item name="userId" rules={[{ required: true, message: 'User id required' }]}>
              <Input placeholder="User id" allowClear />
            </Form.Item>
            <Form.Item name="role" rules={[{ required: true, message: 'Role required' }]} initialValue="Architect">
              <Select style={{ width: 160 }} options={REPOSITORY_ROLES.filter((r) => r !== 'Owner').map((r) => ({ value: r, label: r }))} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">
                Add / Update
              </Button>
            </Form.Item>
          </Form>
        </div>
      ) : null}
    </div>
  );
};

export default SettingsPanel;
