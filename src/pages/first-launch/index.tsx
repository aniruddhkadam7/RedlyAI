import React from 'react';
import { history, useModel } from '@umijs/max';
import { PageContainer } from '@ant-design/pro-components';
import { Button, Card, Empty, Form, Input, Modal, Radio, Select, Space, Typography, message } from 'antd';

import { useEaRepository } from '@/ea/EaRepositoryContext';
import { useEaProject } from '@/ea/EaProjectContext';
import {
  ARCHITECTURE_SCOPES,
  GOVERNANCE_MODES,
  LIFECYCLE_COVERAGE_OPTIONS,
  REFERENCE_FRAMEWORKS,
  TIME_HORIZONS,
  type ArchitectureScope,
  type FrameworkConfig,
  type GovernanceMode,
  type LifecycleCoverage,
  type ReferenceFramework,
  type TimeHorizon,
} from '@/repository/repositoryMetadata';
import { CUSTOM_CORE_EA_SEED } from '@/repository/customFrameworkConfig';
import { seedDefaultViewsForEnterpriseScope } from '@/repository/enterpriseScopeInit';
import { seedDefaultViewsForDomainScope } from '@/repository/domainScopeInit';
import { seedDefaultViewsForProgrammeScope } from '@/repository/programmeScopeInit';
import { ViewStore } from '@/diagram-studio/view-runtime/ViewStore';
import { DesignWorkspaceStore } from '@/ea/DesignWorkspaceStore';

const safeSlug = (value: string) =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'export';

const safeParseJson = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const readLocalStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const viewLayoutStorageKey = (viewId: string) => `ea.view.layout.positions:${viewId}`;

const FirstLaunch: React.FC = () => {
  const { initialState } = useModel('@@initialState');
  const { createNewRepository, loadRepositoryFromJsonText, eaRepository, metadata } = useEaRepository();
  const { createProject, refreshProject } = useEaProject();

  const PROJECT_FILE_PATH_KEY = 'ea.project.filePath';
  const PROJECT_FILE_NAME_KEY = 'ea.project.fileName';
  const PROJECT_DIRTY_KEY = 'ea.project.dirty';
  const PROJECT_STATUS_EVENT = 'ea:projectStatusChanged';
  const RECENT_PROJECTS_KEY = 'ea.project.recent';

  const [mode, setMode] = React.useState<'home' | 'create'>('home');
  const [customSeedModalOpen, setCustomSeedModalOpen] = React.useState(false);
  const [customFrameworkConfig, setCustomFrameworkConfig] = React.useState<FrameworkConfig | undefined>(undefined);
  const lastFrameworkRef = React.useRef<ReferenceFramework>('ArchiMate');
  const [recentProjects, setRecentProjects] = React.useState<
    Array<{ name: string; path?: string | null; lastOpened?: string | null }>
  >([]);
  const [form] = Form.useForm<{
    repositoryName: string;
    organizationName: string;
    architectureScope: ArchitectureScope;
    referenceFramework: ReferenceFramework;
    governanceMode: GovernanceMode;
    lifecycleCoverage: LifecycleCoverage;
    timeHorizon: TimeHorizon;
  }>();
  const repositoryRef = React.useRef({ eaRepository, metadata });

  const importFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const readFileAsText = async (file: File) => {
    return await file.text();
  };

  React.useEffect(() => {
    repositoryRef.current = { eaRepository, metadata };
  }, [eaRepository, metadata]);

  const updateProjectStatus = React.useCallback(
    (opts: { filePath?: string | null; dirty?: boolean | null; clear?: boolean }) => {
      if (opts.clear) {
        try {
          localStorage.removeItem(PROJECT_FILE_PATH_KEY);
          localStorage.removeItem(PROJECT_FILE_NAME_KEY);
          localStorage.removeItem(PROJECT_DIRTY_KEY);
        } catch {
          // ignore
        }
      } else {
        if (opts.filePath === null) {
          try {
            localStorage.removeItem(PROJECT_FILE_PATH_KEY);
            localStorage.removeItem(PROJECT_FILE_NAME_KEY);
          } catch {
            // ignore
          }
        } else if (typeof opts.filePath === 'string') {
          const fileName = opts.filePath.split(/[\\/]/).pop() ?? '';
          try {
            localStorage.setItem(PROJECT_FILE_PATH_KEY, opts.filePath);
            localStorage.setItem(PROJECT_FILE_NAME_KEY, fileName);
          } catch {
            // ignore
          }
        }
        if (typeof opts.dirty === 'boolean') {
          try {
            localStorage.setItem(PROJECT_DIRTY_KEY, String(opts.dirty));
          } catch {
            // ignore
          }
        }
      }

      try {
        window.dispatchEvent(new Event(PROJECT_STATUS_EVENT));
      } catch {
        // ignore
      }
    },
    [PROJECT_DIRTY_KEY, PROJECT_FILE_NAME_KEY, PROJECT_FILE_PATH_KEY, PROJECT_STATUS_EVENT],
  );

  const applyProjectPayload = React.useCallback(
    (payload: any) => {
      const snapshot = payload?.repository?.snapshot ?? null;
      if (!snapshot || typeof snapshot !== 'object') {
        return { ok: false, error: 'Invalid project file: missing repository snapshot.' } as const;
      }

      const snapshotText = JSON.stringify(snapshot);
      const loadRes = loadRepositoryFromJsonText(snapshotText);
      if (!loadRes.ok) return loadRes;

      const viewItems = Array.isArray(payload?.views?.items) ? payload.views.items : [];
      const viewLayouts = payload?.studioState?.viewLayouts ?? {};

      const existingViews = ViewStore.list();
      for (const v of existingViews) {
        try {
          localStorage.removeItem(viewLayoutStorageKey(v.id));
        } catch {
          // ignore
        }
      }

      try {
        localStorage.setItem('ea:diagram-views', JSON.stringify(viewItems));
      } catch {
        // Best-effort only.
      }

      for (const v of viewItems as Array<{ id?: string }>) {
        const id = String(v?.id ?? '').trim();
        if (!id) continue;
        const layout = viewLayouts?.[id];
        try {
          if (layout && typeof layout === 'object') {
            localStorage.setItem(viewLayoutStorageKey(id), JSON.stringify(layout));
          } else {
            localStorage.removeItem(viewLayoutStorageKey(id));
          }
        } catch {
          // ignore
        }
      }

      const repositoryName = snapshot?.metadata?.repositoryName || 'default';
      const designWorkspaces = Array.isArray(payload?.studioState?.designWorkspaces)
        ? payload.studioState.designWorkspaces
        : [];
      DesignWorkspaceStore.replaceAll(repositoryName, designWorkspaces);

      const ideLayout = payload?.studioState?.ideLayout ?? null;
      if (ideLayout && typeof ideLayout === 'object') {
        const map: Array<[string, string | null | undefined]> = [
          ['ide.activity', ideLayout.activity],
          ['ide.sidebar.open', ideLayout.sidebarOpen],
          ['ide.sidebar.width', ideLayout.sidebarWidth],
          ['ide.bottom.open', ideLayout.bottomOpen],
          ['ide.bottom.height', ideLayout.bottomHeight],
          ['ide.panel.dock', ideLayout.panelDock],
          ['ide.panel.right.width', ideLayout.rightPanelWidth],
        ];
        for (const [key, value] of map) {
          if (value === null || value === undefined) continue;
          try {
            localStorage.setItem(key, String(value));
          } catch {
            // ignore
          }
        }
      }

      const prefs = payload?.studioState?.preferences ?? null;
      if (prefs && typeof prefs === 'object') {
        const prefMap: Array<[string, string | null | undefined]> = [
          ['ea.applicationGrouping', prefs.applicationGrouping],
          ['ea.programmeScope.showTechnology', prefs.programmeScopeShowTechnology],
          ['ea.seed.banner.dismissed', prefs.seedBannerDismissed],
          ['ea.catalogDefined', prefs.catalogDefined],
        ];
        for (const [key, value] of prefMap) {
          if (value === null || value === undefined) continue;
          try {
            localStorage.setItem(key, String(value));
          } catch {
            // ignore
          }
        }
      }

      try {
        window.dispatchEvent(new Event('ea:viewsChanged'));
        window.dispatchEvent(new Event('ea:workspacesChanged'));
      } catch {
        // Best-effort only.
      }

      return { ok: true } as const;
    },
    [loadRepositoryFromJsonText],
  );

  const updateRecentProjects = React.useCallback(
    (entry: { name: string; path?: string | null }) => {
      try {
        const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
        const existing = safeParseJson<Array<{ name: string; path?: string; lastOpened?: string }>>(raw, []);
        const next = [
          {
            name: entry.name,
            path: entry.path ?? undefined,
            lastOpened: new Date().toISOString(),
          },
          ...existing.filter((item) => item.path && item.path !== entry.path),
        ].slice(0, 10);
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
        setRecentProjects(next);
      } catch {
        // ignore
      }
    },
    [RECENT_PROJECTS_KEY],
  );

  const waitForRepositoryReady = React.useCallback(async () => {
    for (let i = 0; i < 8; i += 1) {
      if (repositoryRef.current.eaRepository && repositoryRef.current.metadata) {
        return repositoryRef.current;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return repositoryRef.current;
  }, []);

  const buildProjectPayload = React.useCallback(async () => {
    const repoState = await waitForRepositoryReady();
    if (!repoState.eaRepository || !repoState.metadata) return null;

    const repositorySnapshot = {
      version: 1 as const,
      metadata: repoState.metadata,
      objects: Array.from(repoState.eaRepository.objects.values()).map((o) => ({
        id: o.id,
        type: o.type,
        attributes: { ...(o.attributes ?? {}) },
      })),
      relationships: repoState.eaRepository.relationships.map((r) => ({
        fromId: r.fromId,
        toId: r.toId,
        type: r.type,
        attributes: { ...(r.attributes ?? {}) },
      })),
      updatedAt: new Date().toISOString(),
    };

    const views = ViewStore.list();
    const viewLayouts = views.reduce<Record<string, Record<string, { x: number; y: number }>>>(
      (acc, view) => {
        const raw = readLocalStorage(viewLayoutStorageKey(view.id));
        const parsed = safeParseJson<Record<string, { x: number; y: number }>>(
          raw,
          {} as Record<string, { x: number; y: number }>,
        );
        acc[view.id] = parsed;
        return acc;
      },
      {},
    );

    const repositoryName = repoState.metadata.repositoryName || 'default';
    const designWorkspaces = DesignWorkspaceStore.list(repositoryName);

    const studioState = {
      ideLayout: {
        activity: readLocalStorage('ide.activity'),
        sidebarOpen: readLocalStorage('ide.sidebar.open'),
        sidebarWidth: readLocalStorage('ide.sidebar.width'),
        bottomOpen: readLocalStorage('ide.bottom.open'),
        bottomHeight: readLocalStorage('ide.bottom.height'),
        panelDock: readLocalStorage('ide.panel.dock'),
        rightPanelWidth: readLocalStorage('ide.panel.right.width'),
      },
      preferences: {
        applicationGrouping: readLocalStorage('ea.applicationGrouping'),
        programmeScopeShowTechnology: readLocalStorage('ea.programmeScope.showTechnology'),
        seedBannerDismissed: readLocalStorage('ea.seed.banner.dismissed'),
        catalogDefined: readLocalStorage('ea.catalogDefined'),
      },
      viewLayouts,
      designWorkspaces,
    };

    return {
      version: 1 as const,
      meta: {
        createdAt: repoState.metadata.createdAt,
        updatedAt: new Date().toISOString(),
        repositoryName: repoState.metadata.repositoryName,
        organizationName: repoState.metadata.organizationName,
        referenceFramework: repoState.metadata.referenceFramework,
        timeHorizon: repoState.metadata.timeHorizon,
      },
      repository: {
        metadata: repoState.metadata,
        metamodel: repoState.metadata.frameworkConfig ?? null,
        snapshot: repositorySnapshot,
      },
      views: {
        items: views,
      },
      studioState,
    };
  }, [waitForRepositoryReady]);

  const handleOpenProject = React.useCallback(async () => {
    if (!window.eaDesktop?.openProject) {
      message.info('Open Project is available in the desktop app.');
      return;
    }

    const res = await window.eaDesktop.openProject();
    if (!res.ok) {
      Modal.error({ title: 'Open Project failed', content: res.error });
      return;
    }
    if (res.canceled) return;
    if (!res.content) {
      Modal.error({ title: 'Open Project failed', content: 'Empty project file.' });
      return;
    }

    try {
      const payload = JSON.parse(res.content);
      const applied = applyProjectPayload(payload);
      if (!applied.ok) {
        Modal.error({ title: 'Open Project failed', content: applied.error });
        return;
      }

      const name =
        payload?.meta?.repositoryName ||
        payload?.repository?.metadata?.repositoryName ||
        res.filePath?.split(/[\\/]/).pop() ||
        'EA Project';

      try {
        await createProject({
          name,
          description: payload?.meta?.organizationName ? `${payload.meta.organizationName} EA project` : '',
        });
      } catch {
        // Best-effort only.
      }

      updateProjectStatus({ filePath: res.filePath ?? null, dirty: false });
      updateRecentProjects({ name, path: res.filePath ?? null });
      message.success('Project opened.');
      history.push('/workspace');
    } catch (err) {
      Modal.error({ title: 'Open Project failed', content: err instanceof Error ? err.message : 'Invalid project file.' });
    }
  }, [applyProjectPayload, updateProjectStatus, updateRecentProjects]);

  const handleOpenRecentProject = React.useCallback(
    async (entry: { name: string; path?: string | null }) => {
      if (!entry.path) return;
      if (!window.eaDesktop?.openProjectAtPath) {
        message.info('Open Project is available in the desktop app.');
        return;
      }

      const res = await window.eaDesktop.openProjectAtPath(entry.path);
      if (!res.ok) {
        Modal.error({ title: 'Open Project failed', content: res.error });
        return;
      }
      if (!res.content) {
        Modal.error({ title: 'Open Project failed', content: 'Empty project file.' });
        return;
      }

      try {
        const payload = JSON.parse(res.content);
        const applied = applyProjectPayload(payload);
        if (!applied.ok) {
          Modal.error({ title: 'Open Project failed', content: applied.error });
          return;
        }

        const name =
          payload?.meta?.repositoryName ||
          payload?.repository?.metadata?.repositoryName ||
          entry.name ||
          'EA Project';

        try {
          await createProject({
            name,
            description: payload?.meta?.organizationName ? `${payload.meta.organizationName} EA project` : '',
          });
        } catch {
          // Best-effort only.
        }

        updateProjectStatus({ filePath: res.filePath ?? entry.path, dirty: false });
        updateRecentProjects({ name, path: res.filePath ?? entry.path });
        message.success('Project opened.');
        history.push('/workspace');
      } catch (err) {
        Modal.error({ title: 'Open Project failed', content: err instanceof Error ? err.message : 'Invalid project file.' });
      }
    },
    [applyProjectPayload, updateProjectStatus, updateRecentProjects],
  );

  const onImportFileSelected = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const res = loadRepositoryFromJsonText(text);
      if (!res.ok) {
        message.error(res.error);
        return;
      }
      message.success('Repository imported.');
    } catch (e: any) {
      message.error(e?.message || 'Failed to import repository.');
    }
  };

  const readRecentProjects = React.useCallback(() => {
    try {
      const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
      if (raw) {
        const parsed = safeParseJson<Array<{ name: string; path?: string; lastOpened?: string }>>(raw, []);
        if (parsed.length) {
          setRecentProjects(parsed);
          return;
        }
      }
      const filePath = localStorage.getItem(PROJECT_FILE_PATH_KEY);
      const fileName = localStorage.getItem(PROJECT_FILE_NAME_KEY);
      const name = fileName?.trim() || filePath?.split(/[\\/]/).pop() || '';
      if (!name) {
        setRecentProjects([]);
        return;
      }
      setRecentProjects([{ name, path: filePath, lastOpened: null }]);
    } catch {
      setRecentProjects([]);
    }
  }, [PROJECT_FILE_NAME_KEY, PROJECT_FILE_PATH_KEY, RECENT_PROJECTS_KEY]);


  React.useEffect(() => {
    readRecentProjects();
    const onStatus = () => readRecentProjects();
    window.addEventListener(PROJECT_STATUS_EVENT, onStatus as EventListener);
    window.addEventListener('storage', onStatus as EventListener);
    return () => {
      window.removeEventListener(PROJECT_STATUS_EVENT, onStatus as EventListener);
      window.removeEventListener('storage', onStatus as EventListener);
    };
  }, [PROJECT_STATUS_EVENT, readRecentProjects]);

  return (
    <div style={{ height: '100vh' }}>
      <PageContainer
        ghost
        style={{ height: '100%' }}
        content={
          <div
            style={{
              height: 'calc(100vh - 48px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12,
            }}
          >
            <Card
              style={{ width: 640, maxWidth: '100%' }}
              title="Enterprise Architecture Project Hub"
              bodyStyle={{ padding: 12 }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)',
                  gap: 8,
                }}
              >
                <div>
                  {mode === 'home' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <Typography.Title level={5} style={{ margin: 0, fontSize: 16 }}>
                        Start
                      </Typography.Title>
                      <Typography.Paragraph type="secondary" style={{ marginBottom: 4, fontSize: 12 }}>
                        Create or open a project to begin modeling.
                      </Typography.Paragraph>

                      <Button type="primary" onClick={() => setMode('create')}>
                        Create New Architecture Project
                      </Button>

                      <Button onClick={handleOpenProject}>
                        Open Existing Project
                      </Button>

                      <Button onClick={() => importFileInputRef.current?.click()}>
                        Import Project
                      </Button>

                      <input
                        ref={importFileInputRef}
                        type="file"
                        accept="application/json,.json"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          void onImportFileSelected(e.target.files?.[0]);
                          e.currentTarget.value = '';
                        }}
                      />
                    </div>
                  ) : (
                    <>
                      <Typography.Title level={5} style={{ margin: 0, fontSize: 16 }}>
                        New Architecture Project
                      </Typography.Title>
                      <Typography.Paragraph type="secondary" style={{ marginBottom: 6, fontSize: 12 }}>
                        Create a project shell (metadata only). No architecture elements will be created.
                      </Typography.Paragraph>
                      <Form
                        form={form}
                        layout="vertical"
                        size="small"
                        requiredMark
                        initialValues={{
                          architectureScope: 'Enterprise',
                          referenceFramework: 'ArchiMate',
                          governanceMode: 'Strict',
                          lifecycleCoverage: 'Both',
                          timeHorizon: '1–3 years',
                        }}
                        onFinish={(values) => {
                          const res = createNewRepository({
                            ...values,
                            frameworkConfig: values.referenceFramework === 'Custom' ? customFrameworkConfig : undefined,
                          });
                          if (!res.ok) {
                            message.error(res.error);
                            return;
                          }

                          // One-time IDE startup behavior for a newly created repository.
                          // Scope-specific default starting point.
                          try {
                            const intent =
                              values.architectureScope === 'Domain'
                                ? 'business.capabilities'
                                : values.architectureScope === 'Programme'
                                  ? 'implmig.programmes'
                                  : 'business.enterprises';
                            localStorage.setItem('ea.startup.open.v1', intent);
                          } catch {
                            // Best-effort only.
                          }

                          // Best-effort: bootstrap a project so explorer/views are available immediately.
                          // This creates metadata only; it does not create any architecture elements.
                          void (async () => {
                            try {
                              await refreshProject();
                            } catch {
                              // Ignore refresh failures; createProject may still succeed depending on environment.
                            }

                            try {
                              await createProject({
                                name: values.repositoryName,
                                description: `${values.organizationName} EA repository`,
                              });
                            } catch {
                              // If the project already exists or API is unavailable, continue.
                            }

                            // Reference-framework behavior: ArchiMate and TOGAF repositories start empty (no preloaded diagrams/views).
                            if (values.referenceFramework !== 'ArchiMate' && values.referenceFramework !== 'TOGAF') {
                              if (values.architectureScope === 'Enterprise') {
                                try {
                                  seedDefaultViewsForEnterpriseScope();
                                } catch {
                                  // Best-effort only.
                                }
                              }

                              if (values.architectureScope === 'Domain') {
                                try {
                                  seedDefaultViewsForDomainScope();
                                } catch {
                                  // Best-effort only.
                                }
                              }

                              if (values.architectureScope === 'Programme') {
                                try {
                                  seedDefaultViewsForProgrammeScope();
                                } catch {
                                  // Best-effort only.
                                }
                              }
                            }

                            const payload = await buildProjectPayload();
                            if (!payload) {
                              message.error('Failed to create project file.');
                              return;
                            }

                            if (!window.eaDesktop?.saveProject) {
                              message.info('Project file creation is available in the desktop app.');
                              return;
                            }

                            const suggestedName = `ea-project-${safeSlug(values.repositoryName)}.eaproj`;
                            const saveRes = await window.eaDesktop.saveProject({
                              payload,
                              suggestedName,
                              saveAs: true,
                            });

                            if (!saveRes.ok) {
                              message.error(saveRes.error);
                              return;
                            }
                            if (saveRes.canceled) return;
                            const savedPath = saveRes.filePath ?? null;
                            updateProjectStatus({ filePath: savedPath, dirty: false });
                            updateRecentProjects({ name: values.repositoryName, path: savedPath });

                            history.push('/workspace');
                          })();

                      message.success('Project created.');
                    }}
                  >
                    <Form.Item
                      label="Project Name"
                      name="repositoryName"
                      rules={[{ required: true, whitespace: true, message: 'Repository Name is required.' }]}
                    >
                      <Input placeholder="e.g. Tata Group EA Project" />
                    </Form.Item>

                    <Form.Item
                      label="Organization Name"
                      name="organizationName"
                      rules={[{ required: true, whitespace: true, message: 'Organization Name is required.' }]}
                    >
                      <Input placeholder="e.g. Tata Group" />
                    </Form.Item>

                    <Form.Item
                      label="Architecture Scope"
                      name="architectureScope"
                      rules={[{ required: true, message: 'Architecture Scope is required.' }]}
                    >
                      <Select options={ARCHITECTURE_SCOPES.map((v) => ({ value: v, label: v }))} />
                    </Form.Item>

                    <Form.Item
                      label="Reference Framework"
                      name="referenceFramework"
                      rules={[{ required: true, message: 'Reference Framework is required.' }]}
                    >
                      <Select
                        options={REFERENCE_FRAMEWORKS.map((v) => ({ value: v, label: v }))}
                        onChange={(value) => {
                          if (value === 'Custom') {
                            setCustomSeedModalOpen(true);
                            form.setFieldsValue({ referenceFramework: lastFrameworkRef.current });
                            return;
                          }
                          lastFrameworkRef.current = value as ReferenceFramework;
                          setCustomFrameworkConfig(undefined);
                        }}
                      />
                    </Form.Item>

                    <Form.Item
                      label="Governance Mode"
                      name="governanceMode"
                      rules={[{ required: true, message: 'Governance Mode is required.' }]}
                    >
                      <Radio.Group>
                        <Space direction="vertical">
                          {GOVERNANCE_MODES.map((v) => (
                            <Radio key={v} value={v}>
                              {v}
                            </Radio>
                          ))}
                        </Space>
                      </Radio.Group>
                    </Form.Item>

                    <Form.Item
                      label="Lifecycle Coverage"
                      name="lifecycleCoverage"
                      rules={[{ required: true, message: 'Lifecycle Coverage is required.' }]}
                    >
                      <Select options={LIFECYCLE_COVERAGE_OPTIONS.map((v) => ({ value: v, label: v }))} />
                    </Form.Item>

                    <Form.Item
                      label="Time Horizon"
                      name="timeHorizon"
                      rules={[{ required: true, message: 'Time Horizon is required.' }]}
                    >
                      <Select options={TIME_HORIZONS.map((v) => ({ value: v, label: v }))} />
                    </Form.Item>

                    <Space style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Button onClick={() => setMode('home')}>Back</Button>
                      <Button type="primary" htmlType="submit">
                        Create Project
                      </Button>
                    </Space>
                  </Form>
                </>
              )}
            </div>
            <div>
              <Typography.Title level={5} style={{ margin: 0, fontSize: 16 }}>
                Recent Projects
              </Typography.Title>
              <div
                style={{
                  marginTop: 6,
                  padding: 10,
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  background: '#fafafa',
                  minHeight: 100,
                }}
              >
                {recentProjects.length ? (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    {recentProjects.map((item) => (
                      <button
                        key={`${item.name}-${item.path ?? 'unknown'}`}
                        type="button"
                        onClick={() => void handleOpenRecentProject(item)}
                        style={{
                          textAlign: 'left',
                          border: '1px solid #f0f0f0',
                          borderRadius: 6,
                          background: '#fff',
                          padding: 12,
                          width: '100%',
                          cursor: item.path ? 'pointer' : 'default',
                        }}
                      >
                        <Typography.Text strong>{item.name}</Typography.Text>
                        {item.path ? (
                          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                            {item.path}
                          </Typography.Text>
                        ) : null}
                        {item.lastOpened ? (
                          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                            Last opened: {new Date(item.lastOpened).toLocaleString()}
                          </Typography.Text>
                        ) : null}
                      </button>
                    ))}
                  </Space>
                ) : (
                  <Empty description="No recent projects yet." />
                )}
              </div>
            </div>
          </div>
        </Card>
          </div>
        }
      />

      <Modal
        title="Custom framework setup"
        open={customSeedModalOpen}
        onCancel={() => setCustomSeedModalOpen(false)}
        footer={[
          <Button
            key="blank"
            onClick={() => {
              setCustomFrameworkConfig({ custom: { enabledObjectTypes: [], enabledRelationshipTypes: [] } });
              form.setFieldsValue({ referenceFramework: 'Custom' });
              lastFrameworkRef.current = 'Custom';
              setCustomSeedModalOpen(false);
            }}
          >
            Blank
          </Button>,
          <Button
            key="core"
            type="primary"
            onClick={() => {
              setCustomFrameworkConfig({
                custom: {
                  enabledObjectTypes: CUSTOM_CORE_EA_SEED.enabledObjectTypes,
                  enabledRelationshipTypes: CUSTOM_CORE_EA_SEED.enabledRelationshipTypes,
                },
              });
              form.setFieldsValue({ referenceFramework: 'Custom' });
              lastFrameworkRef.current = 'Custom';
              setCustomSeedModalOpen(false);
            }}
          >
            Core EA types
          </Button>,
        ]}
      >
        <Typography.Text>Start from blank or start with core EA types?</Typography.Text>
      </Modal>
    </div>
  );
};

export default FirstLaunch;
