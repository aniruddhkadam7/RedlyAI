import React from 'react';
import { useModel } from '@umijs/max';
import { Button, Input, List, Menu, Modal, Select, Typography, message, notification } from 'antd';
import * as XLSX from 'xlsx';

import { useEaRepository } from '@/ea/EaRepositoryContext';
import { useIdeSelection } from '@/ide/IdeSelectionContext';
import { dispatchIdeCommand } from '@/ide/ideCommands';
import { clearAnalysisResults, getAnalysisResult } from '@/analysis/analysisResultsStore';

import { applyEaImportBatch } from '@/pages/dependency-view/utils/eaImportUtils';
import { parseAndValidateCapabilitiesCsv } from '@/pages/dependency-view/utils/parseCapabilitiesCsv';
import { parseAndValidateApplicationsCsv } from '@/pages/dependency-view/utils/parseApplicationsCsv';
import { parseAndValidateDependenciesCsv } from '@/pages/dependency-view/utils/parseDependenciesCsv';
import { parseAndValidateTechnologyCsv } from '@/pages/dependency-view/utils/parseTechnologyCsv';
import { parseAndValidateProgrammesCsv } from '@/pages/dependency-view/utils/parseProgrammesCsv';
import { getReadOnlyReason, isAnyObjectTypeWritableForScope } from '@/repository/architectureScopePolicy';

import { buildGovernanceDebt } from '@/ea/governanceValidation';
import { appendGovernanceLog } from '@/ea/governanceLog';
import { defaultLifecycleStateForLifecycleCoverage } from '@/repository/lifecycleCoveragePolicy';
import { useSeedSampleData } from '@/ea/useSeedSampleData';

import styles from './style.module.less';

const downloadTextFile = (fileName: string, text: string, mime: string) => {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const safeSlug = (value: string) =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'export';

const parseSelectedEntityId = (selectionKey: string | undefined): string | null => {
  if (!selectionKey) return null;
  const idx = selectionKey.lastIndexOf(':entity:');
  if (idx < 0) return null;
  const id = selectionKey.slice(idx + ':entity:'.length).trim();
  return id || null;
};

type NewRepoDraft = {
  organizationName: string;
  industry: string;
  architectureScope: 'Enterprise' | 'Business Unit' | 'Domain' | 'Programme';
  referenceFramework: 'TOGAF' | 'Custom' | 'ArchiMate';
  timeHorizon: 'Current' | '1–3 years' | 'Strategic';
};

const DEFAULT_NEW_REPO: NewRepoDraft = {
  organizationName: '',
  industry: '',
  architectureScope: 'Enterprise',
  referenceFramework: 'ArchiMate',
  timeHorizon: '1–3 years',
};

const IdeMenuBar: React.FC = () => {
  const { initialState } = useModel('@@initialState');
  const {
    eaRepository,
    metadata,
    setEaRepository,
    trySetEaRepository,
    createNewRepository,
    loadRepositoryFromJsonText,
    clearRepository,
    canUndo,
    canRedo,
    undo,
    redo,
  } = useEaRepository();

  const { selection, setSelection } = useIdeSelection();
  const { openSeedSampleDataModal } = useSeedSampleData();

  const hasRepo = Boolean(eaRepository && metadata);
  const selectedEntityId = hasRepo ? parseSelectedEntityId(selection.keys?.[0]) : null;
  const selectedEntityType =
    hasRepo && selectedEntityId ? ((eaRepository?.objects.get(selectedEntityId)?.type ?? null) as string | null) : null;
  const selectedEntityReadOnlyReason = getReadOnlyReason(metadata?.architectureScope, selectedEntityType);
  const canEditSelectedEntity = !selectedEntityReadOnlyReason;

  const canImportCapabilities = isAnyObjectTypeWritableForScope(metadata?.architectureScope, 'Capability');
  const canImportTechnology = isAnyObjectTypeWritableForScope(metadata?.architectureScope, 'Technology');
  const canImportProgrammes = isAnyObjectTypeWritableForScope(metadata?.architectureScope, 'Programme');

  const [newRepoOpen, setNewRepoOpen] = React.useState(false);
  const [newRepoDraft, setNewRepoDraft] = React.useState<NewRepoDraft>(DEFAULT_NEW_REPO);

  const openRepoInputRef = React.useRef<HTMLInputElement | null>(null);
  const importCapabilitiesInputRef = React.useRef<HTMLInputElement | null>(null);
  const importApplicationsInputRef = React.useRef<HTMLInputElement | null>(null);
  const importDependenciesInputRef = React.useRef<HTMLInputElement | null>(null);
  const importTechnologyInputRef = React.useRef<HTMLInputElement | null>(null);
  const importProgrammesInputRef = React.useRef<HTMLInputElement | null>(null);

  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState('');

  const [findOpen, setFindOpen] = React.useState(false);
  const [findQuery, setFindQuery] = React.useState('');

  const handleNewRepo = React.useCallback(() => {
    console.log('[IDE] File > New EA Repository');
    setNewRepoDraft(DEFAULT_NEW_REPO);
    setNewRepoOpen(true);
  }, []);

  const handleConfirmNewRepo = React.useCallback(() => {
    console.log('[IDE] Creating new repository', newRepoDraft);

    const org = newRepoDraft.organizationName.trim();
    if (!org) {
      message.error('Organization name is required.');
      return;
    }

    // Map to repository metadata (enterprise-friendly defaults).
    const repositoryName = `${org} EA Repository`;

    const res = createNewRepository({
      repositoryName,
      organizationName: org,
      industry: newRepoDraft.industry.trim() || undefined,
      architectureScope: newRepoDraft.architectureScope,
      referenceFramework: newRepoDraft.referenceFramework,
      governanceMode: 'Strict',
      lifecycleCoverage: 'Both',
      timeHorizon: newRepoDraft.timeHorizon,
    });

    if (!res.ok) {
      message.error(res.error);
      return;
    }

    // Clear editor/analysis context explicitly.
    clearAnalysisResults();
    dispatchIdeCommand({ type: 'workspace.resetTabs' });
    setSelection({ kind: 'none', keys: [] });

    setNewRepoOpen(false);
    message.success('Repository created.');
  }, [createNewRepository, newRepoDraft, setSelection]);

  const handleOpenRepo = React.useCallback(() => {
    console.log('[IDE] File > Open EA Repository');
    openRepoInputRef.current?.click();
  }, []);

  const handleOpenRepoFileSelected: React.ChangeEventHandler<HTMLInputElement> = React.useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;

      console.log('[IDE] Opening repository from file', { name: file.name, type: file.type, size: file.size });

      if (file.name.toLowerCase().endsWith('.zip')) {
        notification.info({
          message: 'ZIP import placeholder',
          description: 'ZIP repositories are not supported yet. Please use a JSON snapshot for now.',
          placement: 'bottomRight',
        });
        return;
      }

      try {
        const text = await file.text();
        const res = loadRepositoryFromJsonText(text);
        if (!res.ok) {
          Modal.error({ title: 'Open Repository failed', content: res.error });
          return;
        }

        clearAnalysisResults();
        dispatchIdeCommand({ type: 'workspace.resetTabs' });
        setSelection({ kind: 'none', keys: [] });

        message.success('Repository opened.');
      } catch (err) {
        Modal.error({
          title: 'Open Repository failed',
          content: err instanceof Error ? err.message : 'Failed to read file.',
        });
      }
    },
    [loadRepositoryFromJsonText, setSelection],
  );

  const handleCloseRepository = React.useCallback(() => {
    console.log('[IDE] File > Close Repository');

    Modal.confirm({
      title: 'Close repository?',
      content: 'This unloads the current repository context (no browser close).',
      okText: 'Close',
      cancelText: 'Cancel',
      onOk: () => {
        clearRepository();
        clearAnalysisResults();
        dispatchIdeCommand({ type: 'workspace.resetTabs' });
        setSelection({ kind: 'none', keys: [] });
        message.success('Repository closed.');
      },
    });
  }, [clearRepository, setSelection]);

  const importCsv = React.useCallback(
    async (args: {
      label: string;
      file: File;
      parse: (
        csvText: string,
      ) =>
        | { ok: true; apply: () => { ok: true } | { ok: false; error: string }; summary: string }
        | { ok: false; errors: string[] };
    }) => {
      console.log('[IDE] Import', args.label, { name: args.file.name, size: args.file.size });

      const fileToCsv = async (file: File) => {
        const lower = file.name.toLowerCase();
        const isExcel = lower.endsWith('.xlsx') || lower.endsWith('.xls');
        if (!isExcel) return file.text();

        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error('Excel file has no sheets.');
        const sheet = workbook.Sheets[sheetName];
        // Use explicit newline to avoid unterminated string issues in bundler parsing.
        return XLSX.utils.sheet_to_csv(sheet, { FS: ',', RS: "\n" });
      };

      try {
        const csvText = await fileToCsv(args.file);
        const res = args.parse(csvText);
        if (!res.ok) {
          Modal.error({
            title: `${args.label} failed`,
            content: (
              <div style={{ maxHeight: 240, overflow: 'auto' }}>
                {(res.errors ?? []).slice(0, 50).map((e, idx) => (
                  <div key={idx}>{e}</div>
                ))}
                {(res.errors ?? []).length > 50 ? <div>…</div> : null}
              </div>
            ),
          });
          return;
        }

        const applied = res.apply();
        if (!applied.ok) return;
        message.success(res.summary);
      } catch (err) {
        Modal.error({
          title: `${args.label} failed`,
          content: err instanceof Error ? err.message : 'Failed to read file.',
        });
      }
    },
    [],
  );

  const handleImportCapabilitiesCsv = React.useCallback(() => {
    console.log('[IDE] File > Import > Capabilities CSV');
    if (!canImportCapabilities) {
      message.warning('Capabilities are read-only in the current architecture scope.');
      return;
    }
    importCapabilitiesInputRef.current?.click();
  }, [canImportCapabilities]);

  const handleImportApplicationsCsv = React.useCallback(() => {
    console.log('[IDE] File > Import > Applications CSV');
    importApplicationsInputRef.current?.click();
  }, []);

  const handleImportDependenciesCsv = React.useCallback(() => {
    console.log('[IDE] File > Import > Dependencies CSV');
    importDependenciesInputRef.current?.click();
  }, []);

  const handleImportTechnologyCsv = React.useCallback(() => {
    console.log('[IDE] File > Import > Technology CSV');
    importTechnologyInputRef.current?.click();
  }, []);

  const handleImportProgrammesCsv = React.useCallback(() => {
    console.log('[IDE] File > Import > Programmes CSV');
    if (!canImportProgrammes) {
      message.warning('Programmes are read-only in the current architecture scope.');
      return;
    }
    importProgrammesInputRef.current?.click();
  }, [canImportProgrammes]);

  const handleExportRepositorySnapshot = React.useCallback(() => {
    console.log('[IDE] File > Export > Repository Snapshot');
    if (!eaRepository || !metadata) return;

    const doExport = () => {
      const snapshot = {
        version: 1 as const,
        metadata,
        objects: Array.from(eaRepository.objects.values()).map((o) => ({
          id: o.id,
          type: o.type,
          attributes: { ...(o.attributes ?? {}) },
        })),
        relationships: eaRepository.relationships.map((r) => ({
          fromId: r.fromId,
          toId: r.toId,
          type: r.type,
          attributes: { ...(r.attributes ?? {}) },
        })),
        updatedAt: new Date().toISOString(),
      };

      const fileName = `ea-repository-${safeSlug(metadata.repositoryName)}.json`;
      downloadTextFile(fileName, JSON.stringify(snapshot, null, 2), 'application/json;charset=utf-8');
      message.success('Repository snapshot exported.');
    };

    // GovernanceMode behavior:
    // - Strict: block export when mandatory attributes are missing OR invalid relationships are detected
    // - Advisory: allow export with warnings (non-blocking)
    try {
      const nowDate = new Date();

      const debt = buildGovernanceDebt(eaRepository, nowDate);
      const {
        mandatoryFindingCount,
        invalidRelationshipInsertCount,
        relationshipErrorCount,
        relationshipWarningCount,
        total,
      } = debt.summary;

      const hasBlockingStrictViolations =
        mandatoryFindingCount > 0 || relationshipErrorCount > 0 || invalidRelationshipInsertCount > 0;

      const mandatoryDetails = debt.repoReport.findings
        .slice(0, 5)
        .map((f) => `• ${f.message} (${f.elementId})`)
        .join('\n');
      const mandatoryMore = debt.repoReport.findings.length > 5 ? `\n… and ${debt.repoReport.findings.length - 5} more.` : '';

      const relationshipErrorFindings = debt.relationshipReport.findings.filter((f) => f.severity === 'Error');
      const relationshipErrorDetails = relationshipErrorFindings
        .slice(0, 5)
        .map((f) => `• ${f.message} (${f.subjectId})`)
        .join('\n');
      const relationshipErrorMore =
        relationshipErrorFindings.length > 5 ? `\n… and ${relationshipErrorFindings.length - 5} more.` : '';

      const invalidRelationshipDetails = debt.invalidRelationshipInserts.slice(0, 5).map((s) => `• ${s}`).join('\n');
      const invalidRelationshipMore =
        debt.invalidRelationshipInserts.length > 5
          ? `\n… and ${debt.invalidRelationshipInserts.length - 5} more.`
          : '';

      const renderDetails = (mode: 'Strict' | 'Advisory') => (
        <div>
          <div>
            Mandatory attribute findings: <strong>{mandatoryFindingCount}</strong>
          </div>
          <div>
            Invalid relationship inserts: <strong>{invalidRelationshipInsertCount}</strong>
          </div>
          <div>
            Relationship errors: <strong>{relationshipErrorCount}</strong>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 600 }}>Details</div>
            {mandatoryFindingCount > 0 ? (
              <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>
                {mandatoryDetails + mandatoryMore}
              </pre>
            ) : null}
            {invalidRelationshipInsertCount > 0 ? (
              <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>
                {invalidRelationshipDetails + invalidRelationshipMore}
              </pre>
            ) : null}
            {relationshipErrorCount > 0 ? (
              <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>
                {relationshipErrorDetails + relationshipErrorMore}
              </pre>
            ) : null}
            {relationshipWarningCount > 0 ? (
              <div style={{ marginTop: 8, opacity: 0.8 }}>Relationship warnings: {relationshipWarningCount}</div>
            ) : null}
            <div style={{ marginTop: 8, opacity: 0.8 }}>Mode: {mode}</div>
          </div>
        </div>
      );

      if (metadata.governanceMode === 'Strict' && hasBlockingStrictViolations) {
        appendGovernanceLog({
          type: 'export.blocked',
          governanceMode: 'Strict',
          repositoryName: metadata.repositoryName,
          architectureScope: metadata.architectureScope ?? undefined,
          summary: debt.summary,
          highlights: [
            ...debt.repoReport.findings.slice(0, 3).map((f) => `Mandatory: ${f.message} (${f.elementId})`),
            ...debt.relationshipReport.findings.slice(0, 3).map((f) => `Relationship: ${f.message} (${f.subjectId})`),
            ...debt.invalidRelationshipInserts.slice(0, 3).map((s) => `Relationship insert: ${s}`),
          ],
        });

        Modal.error({
          title: 'Save blocked by governance (Strict mode)',
          content: (
            <div>
              <div>Fix mandatory attributes and invalid relationships before exporting a snapshot.</div>
              {renderDetails('Strict')}
            </div>
          ),
        });
        return;
      }

      if (metadata.governanceMode === 'Advisory' && total > 0) {
        appendGovernanceLog({
          type: 'export.warned',
          governanceMode: 'Advisory',
          repositoryName: metadata.repositoryName,
          architectureScope: metadata.architectureScope ?? undefined,
          summary: debt.summary,
          highlights: [
            ...debt.repoReport.findings.slice(0, 3).map((f) => `Mandatory: ${f.message} (${f.elementId})`),
            ...debt.relationshipReport.findings.slice(0, 3).map((f) => `Relationship: ${f.message} (${f.subjectId})`),
            ...debt.invalidRelationshipInserts.slice(0, 3).map((s) => `Relationship insert: ${s}`),
          ],
        });

        notification.warning({
          message: 'Exported with governance warnings (Advisory)',
          description: (
            <div>
              <div>{total} issue(s) detected. Export proceeds in Advisory mode.</div>
              <div style={{ marginTop: 8 }}>{renderDetails('Advisory')}</div>
            </div>
          ),
          duration: 8,
        });
      }
    } catch {
      // Best-effort only.
    }

    doExport();
  }, [eaRepository, metadata]);

  const handleExportImpactAnalysisCsv = React.useCallback(() => {
    console.log('[IDE] File > Export > Impact Analysis CSV');

    const docKey = selection.activeDocument?.key ?? '';
    if (!docKey.startsWith('analysisResult:')) {
      message.info('Open an Impact Analysis Result tab to export.');
      return;
    }

    const id = docKey.slice('analysisResult:'.length);
    const rec = getAnalysisResult<any>(id);
    if (!rec || rec.kind !== 'impact') {
      message.info('The active result is not an Impact Analysis result.');
      return;
    }

    const data = rec.data as any;
    const ranked = Array.isArray(data?.rankedImpacts) ? data.rankedImpacts : [];

    // Minimal enterprise-friendly CSV (keeps exports predictable even if internal shapes evolve).
    const header = ['elementId', 'score', 'severity', 'paths', 'hardPaths', 'softOnlyPaths', 'maxDepthObserved'];
    const rows: string[][] = ranked.map((r: any) => [
      String(r.elementId ?? ''),
      String(r.score?.computedScore ?? 0),
      String(r.score?.severityLabel ?? ''),
      String(r.evidence?.totalPathsAffectingElement ?? 0),
      String(r.evidence?.hardPathCount ?? 0),
      String(r.evidence?.softOnlyPathCount ?? 0),
      String(r.evidence?.maxDepthObserved ?? 0),
    ]);

    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell: string) => {
            const s = String(cell ?? '');
            return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(','),
      )
      .join('\n');

    const fileName = `impact-analysis-${safeSlug(rec.title)}.csv`;
    downloadTextFile(fileName, csv, 'text/csv;charset=utf-8');
    message.success('Impact analysis exported.');
  }, [selection.activeDocument?.key]);

  const handleExit = React.useCallback(() => {
    console.log('[IDE] File > Exit');
    Modal.confirm({
      title: 'Exit workspace context?',
      content: 'This unloads repository, analysis, and selection context. The browser tab remains open.',
      okText: 'Unload',
      cancelText: 'Cancel',
      onOk: () => {
        clearRepository();
        clearAnalysisResults();
        dispatchIdeCommand({ type: 'workspace.resetTabs' });
        setSelection({ kind: 'none', keys: [] });
        message.success('Context unloaded.');
      },
    });
  }, [clearRepository, setSelection]);

  const handleUndo = React.useCallback(() => {
    console.log('[IDE] Edit > Undo');
    undo();
  }, [undo]);

  const handleRedo = React.useCallback(() => {
    console.log('[IDE] Edit > Redo');
    redo();
  }, [redo]);

  const handleRenameSelectedElement = React.useCallback(() => {
    console.log('[IDE] Edit > Rename Selected Element');
    if (!eaRepository || !selectedEntityId) return;

    const objType = (eaRepository.objects.get(selectedEntityId)?.type ?? null) as string | null;
    const reason = getReadOnlyReason(metadata?.architectureScope, objType);
    if (reason) {
      message.warning(reason);
      return;
    }

    const obj = eaRepository.objects.get(selectedEntityId);
    const currentName = typeof obj?.attributes?.name === 'string' ? String(obj?.attributes?.name) : '';
    setRenameValue(currentName || selectedEntityId);
    setRenameOpen(true);
  }, [eaRepository, metadata?.architectureScope, selectedEntityId]);

  const handleConfirmRename = React.useCallback(() => {
    if (!eaRepository || !selectedEntityId) return;

    const objType = (eaRepository.objects.get(selectedEntityId)?.type ?? null) as string | null;
    const reason = getReadOnlyReason(metadata?.architectureScope, objType);
    if (reason) {
      message.warning(reason);
      setRenameOpen(false);
      return;
    }

    const nextName = renameValue.trim();
    if (!nextName) {
      message.error('Name is required.');
      return;
    }

    console.log('[IDE] Renaming element', { id: selectedEntityId, nextName });

    const draft = eaRepository.clone();
    const obj = draft.objects.get(selectedEntityId);
    if (!obj) {
      message.error('Selected element no longer exists.');
      setRenameOpen(false);
      return;
    }

    obj.attributes = { ...(obj.attributes ?? {}), name: nextName };
    draft.objects.set(selectedEntityId, obj);

    const applied = trySetEaRepository(draft);
    if (!applied.ok) return;

    setRenameOpen(false);
    message.success('Element renamed.');
  }, [eaRepository, metadata?.architectureScope, renameValue, selectedEntityId, trySetEaRepository]);

  const handleDeleteSelectedElement = React.useCallback(() => {
    console.log('[IDE] Edit > Delete Selected Element');
    if (!eaRepository || !selectedEntityId) return;

    const objType = (eaRepository.objects.get(selectedEntityId)?.type ?? null) as string | null;
    const reason = getReadOnlyReason(metadata?.architectureScope, objType);
    if (reason) {
      message.warning(reason);
      return;
    }

    const rels = eaRepository.relationships.filter((r) => r.fromId === selectedEntityId || r.toId === selectedEntityId);

    Modal.confirm({
      title: 'Delete selected element?',
      content: (
        <div>
          <div>
            Element: <strong>{selectedEntityId}</strong>
          </div>
          <div style={{ marginTop: 8 }}>
            This will remove {rels.length} related relationship(s) to prevent dangling references.
          </div>
        </div>
      ),
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: () => {
        const draft = eaRepository.clone();
        draft.objects.delete(selectedEntityId);
        draft.relationships = draft.relationships.filter((r) => r.fromId !== selectedEntityId && r.toId !== selectedEntityId);

        console.log('[IDE] Deleted element', { id: selectedEntityId, removedRelationships: rels.length });

        const applied = trySetEaRepository(draft);
        if (!applied.ok) return;

        setSelection({ kind: 'none', keys: [] });
        message.success('Element deleted.');
      },
    });
  }, [eaRepository, metadata?.architectureScope, selectedEntityId, setSelection, trySetEaRepository]);

  const handleFindElement = React.useCallback(() => {
    console.log('[IDE] Edit > Find Element');
    setFindQuery('');
    setFindOpen(true);
  }, []);

  const handlePreferences = React.useCallback(() => {
    console.log('[IDE] Edit > Preferences');
    dispatchIdeCommand({ type: 'view.showActivity', activity: 'settings' });
  }, []);

  const handleToggleExplorer = React.useCallback(() => {
    console.log('[IDE] View > Toggle Explorer');
    dispatchIdeCommand({ type: 'view.showActivity', activity: 'explorer' });
    dispatchIdeCommand({ type: 'view.toggleSidebar' });
  }, []);

  const handleToggleDiagrams = React.useCallback(() => {
    console.log('[IDE] View > Toggle Diagrams Panel');
    dispatchIdeCommand({ type: 'view.showActivity', activity: 'diagrams' });
    dispatchIdeCommand({ type: 'view.toggleSidebar' });
  }, []);

  const handleToggleAnalysis = React.useCallback(() => {
    console.log('[IDE] View > Toggle Analysis Panel');
    dispatchIdeCommand({ type: 'view.showActivity', activity: 'analysis' });
    dispatchIdeCommand({ type: 'view.toggleSidebar' });
  }, []);

  const handleToggleGovernance = React.useCallback(() => {
    console.log('[IDE] View > Toggle Governance Panel');
    dispatchIdeCommand({ type: 'navigation.openRoute', path: '/governance' });
  }, []);

  const handleToggleBottomPanel = React.useCallback(() => {
    console.log('[IDE] View > Toggle Bottom Panel');
    dispatchIdeCommand({ type: 'view.toggleBottomPanel' });
  }, []);

  const handleResetLayout = React.useCallback(() => {
    console.log('[IDE] View > Reset Layout');
    dispatchIdeCommand({ type: 'view.resetLayout' });
    message.success('Layout reset to defaults.');
  }, []);

  const handleFullscreenWorkspace = React.useCallback(() => {
    console.log('[IDE] View > Fullscreen Workspace');
    dispatchIdeCommand({ type: 'view.fullscreen.toggle' });
  }, []);

  const handleGovernanceDashboard = React.useCallback(() => {
    console.log('[IDE] Governance > Dashboard');
    dispatchIdeCommand({ type: 'navigation.openRoute', path: '/governance' });
  }, []);

  const handleGovernancePlaceholder = React.useCallback((label: string) => {
    console.log('[IDE] Governance >', label);
    dispatchIdeCommand({ type: 'navigation.openRoute', path: '/governance' });
    notification.info({
      message: label,
      description: 'This governance area is scaffolded. Dashboard is available; deeper tools will be wired next.',
      placement: 'bottomRight',
    });
  }, []);

  const handleToolsRepositoryStats = React.useCallback(() => {
    console.log('[IDE] Tools > Repository Statistics');
    if (!eaRepository) {
      message.info('Load a repository first.');
      return;
    }

    const byType = new Map<string, number>();
    for (const o of eaRepository.objects.values()) {
      byType.set(String(o.type), (byType.get(String(o.type)) ?? 0) + 1);
    }

    const lines = [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    Modal.info({
      title: 'Repository Statistics',
      content: (
        <div style={{ maxHeight: 280, overflow: 'auto' }}>
          <div>Total objects: {eaRepository.objects.size}</div>
          <div>Total relationships: {eaRepository.relationships.length}</div>
          <div style={{ marginTop: 8 }}>Objects by type:</div>
          {lines.map(([t, c]) => (
            <div key={t}>
              {t}: {c}
            </div>
          ))}
        </div>
      ),
    });
  }, [eaRepository]);

  const handleToolsMetamodelViewer = React.useCallback(() => {
    console.log('[IDE] Tools > Schema / Metamodel Viewer');
    dispatchIdeCommand({ type: 'view.showActivity', activity: 'metamodel' });
  }, []);

  const handleToolsImportWizard = React.useCallback(() => {
    console.log('[IDE] Tools > Import / Export');
    dispatchIdeCommand({ type: 'navigation.openRoute', path: '/interoperability' });
    message.info('Opening Import / Export wizard…');
  }, []);

  const handleToolsCacheReset = React.useCallback(() => {
    console.log('[IDE] Tools > Cache / State Reset');
    Modal.confirm({
      title: 'Reset IDE layout + caches?',
      content: 'Resets dock sizes/panels and clears UI-only caches. Repository data is not deleted.',
      okText: 'Reset',
      cancelText: 'Cancel',
      onOk: () => {
        try {
          const keys = Object.keys(localStorage);
          for (const k of keys) {
            if (k.startsWith('ide.')) localStorage.removeItem(k);
          }
        } catch {
          // ignore
        }
        dispatchIdeCommand({ type: 'view.resetLayout' });
        message.success('IDE caches reset.');
      },
    });
  }, []);

  const handleToolsDevDiagnostics = React.useCallback(() => {
    console.log('[IDE] Tools > Developer Diagnostics');
    const payload = {
      env: process.env.NODE_ENV,
      repoLoaded: hasRepo,
      selection,
      metadata,
    };
    Modal.info({
      title: 'Developer Diagnostics',
      content: (
        <pre style={{ maxHeight: 320, overflow: 'auto' }}>{JSON.stringify(payload, null, 2)}</pre>
      ),
    });
  }, [hasRepo, metadata, selection]);

  const handleHelpWelcome = React.useCallback(() => {
    console.log('[IDE] Help > Welcome / Getting Started');
    Modal.info({
      title: 'Welcome / Getting Started',
      content: (
        <div>
          <div>This workspace behaves like an EA IDE:</div>
          <div style={{ marginTop: 8 }}>1) File → New/Open repository</div>
          <div>2) Import catalog data via File → Import</div>
          <div>3) Run analyses via Analysis menu</div>
          <div>4) Review governance via Governance menu</div>
        </div>
      ),
    });
  }, []);

  const handleHelpDocs = React.useCallback(() => {
    console.log('[IDE] Help > Documentation');
    notification.info({
      message: 'Documentation link placeholder',
      description: 'External documentation URL not configured yet.',
      placement: 'bottomRight',
    });
  }, []);

  const handleHelpShortcuts = React.useCallback(() => {
    console.log('[IDE] Help > Keyboard Shortcuts');
    Modal.info({
      title: 'Keyboard Shortcuts',
      content: (
        <div>
          <div>Ctrl/Cmd+K: Command palette (planned)</div>
          <div>Ctrl/Cmd+F: Find element</div>
          <div>Ctrl/Cmd+Z: Undo</div>
          <div>Ctrl/Cmd+Y: Redo</div>
        </div>
      ),
    });
  }, []);

  const handleHelpVersion = React.useCallback(() => {
    console.log('[IDE] Help > Version Info');
    Modal.info({
      title: 'Version Info',
      content: (
        <div>
          <div>Build: {String(process.env.NODE_ENV || 'unknown')}</div>
          <div>Date: {new Date().toISOString()}</div>
        </div>
      ),
    });
  }, []);

  const handleHelpAbout = React.useCallback(() => {
    console.log('[IDE] Help > About');
    Modal.info({
      title: 'About',
      content: (
        <div>
          <div>Enterprise Architecture IDE</div>
          <div>License: See LICENSE</div>
          <div>Build environment: {String(process.env.NODE_ENV || 'unknown')}</div>
        </div>
      ),
    });
  }, []);

  // CSV import bindings (reuse existing parsing logic from dependency-view utilities).
  const parseAndApplyCsv = React.useMemo(() => {
    return {
      capabilities: async (file: File) => {
        return importCsv({
          label: 'Import Capabilities CSV',
          file,
          parse: (csvText) => {
            if (!eaRepository) return { ok: false as const, errors: ['No repository loaded.'] };
            const defaultLifecycleState = defaultLifecycleStateForLifecycleCoverage(metadata?.lifecycleCoverage);
            const result = parseAndValidateCapabilitiesCsv(csvText, { repository: eaRepository });
            if (!result.ok) return result;

            const objects = result.capabilities.map((c: any) => ({
              id: c.id,
              type: c.type,
              attributes: {
                name: c.name,
                category: c.category,
                lifecycleState: (c.attributes ?? {})?.lifecycleState ?? defaultLifecycleState,
                ...(c.attributes ?? {}),
              },
            }));

            const relationships = result.capabilities
              .filter((c: any) => Boolean(c.parentId))
              .map((c: any) => ({ fromId: c.parentId, toId: c.id, type: 'DECOMPOSES_TO' as const, attributes: {} }));

            const applyResult = applyEaImportBatch(eaRepository, { objects, relationships });
            if (!applyResult.ok) return { ok: false as const, errors: applyResult.errors };

            return {
              ok: true as const,
              apply: () => trySetEaRepository(applyResult.nextRepository),
              summary: `Import Capabilities CSV: imported ${objects.length} objects`,
            };
          },
        });
      },
      applications: async (file: File) => {
        return importCsv({
          label: 'Import Applications CSV',
          file,
          parse: (csvText) => {
            if (!eaRepository) return { ok: false as const, errors: ['No repository loaded.'] };
            const defaultLifecycleState = defaultLifecycleStateForLifecycleCoverage(metadata?.lifecycleCoverage);
            const result = parseAndValidateApplicationsCsv(csvText);
            if (!result.ok) return result;

            const draft = eaRepository.clone();
            for (const [id, obj] of draft.objects) {
              if (obj.type === 'Application') draft.objects.delete(id);
            }

            const errors: string[] = [];
            for (const row of result.applications as any[]) {
              const res = draft.addObject({
                id: row.id,
                type: 'Application',
                attributes: {
                  name: row.name,
                  criticality: row.criticality,
                  lifecycle: row.lifecycle,
                  lifecycleState: defaultLifecycleState,
                },
              });
              if (!res.ok) errors.push(res.error);
            }

            draft.relationships = draft.relationships.filter((r) => draft.objects.has(r.fromId) && draft.objects.has(r.toId));
            if (errors.length > 0) return { ok: false as const, errors };

            return {
              ok: true as const,
              apply: () => trySetEaRepository(draft),
              summary: `Import Applications CSV: imported ${result.applications.length} applications`,
            };
          },
        });
      },
      dependencies: async (file: File) => {
        return importCsv({
          label: 'Import Dependencies CSV',
          file,
          parse: (csvText) => {
            if (!eaRepository) return { ok: false as const, errors: ['No repository loaded.'] };

            const existingApplicationIds = new Set<string>();
            for (const obj of eaRepository.objects.values()) {
              if (obj.type === 'Application') existingApplicationIds.add(obj.id);
            }
            if (existingApplicationIds.size === 0) {
              return {
                ok: false as const,
                errors: ['Cannot import dependencies: no Application objects exist in the repository.'],
              };
            }

            const result = parseAndValidateDependenciesCsv(csvText, { existingApplicationIds });
            if (!result.ok) return result;

            const relationships = (result.dependencies as any[]).map((d: any) => ({
              fromId: d.from,
              toId: d.to,
              type: 'INTEGRATES_WITH' as const,
              attributes: { dependencyStrength: d.dependencyStrength, dependencyType: d.dependencyType },
            }));

            const applyResult = applyEaImportBatch(eaRepository, { relationships });
            if (!applyResult.ok) return { ok: false as const, errors: applyResult.errors };

            return {
              ok: true as const,
              apply: () => trySetEaRepository(applyResult.nextRepository),
              summary: `Import Dependencies CSV: imported ${relationships.length} relationships`,
            };
          },
        });
      },
      technology: async (file: File) => {
        return importCsv({
          label: 'Import Technology CSV',
          file,
          parse: (csvText) => {
            if (!eaRepository) return { ok: false as const, errors: ['No repository loaded.'] };
            const defaultLifecycleState = defaultLifecycleStateForLifecycleCoverage(metadata?.lifecycleCoverage);
            const result = parseAndValidateTechnologyCsv(csvText);
            if (!result.ok) return result;

            const objects = (result.technologies as any[]).map((t: any) => ({
              id: t.id,
              type: 'Technology' as const,
              attributes: {
                name: t.name,
                lifecycleState: (t.attributes ?? {})?.lifecycleState ?? defaultLifecycleState,
                ...(t.attributes ?? {}),
              },
            }));

            const applyResult = applyEaImportBatch(eaRepository, { objects });
            if (!applyResult.ok) return { ok: false as const, errors: applyResult.errors };

            return {
              ok: true as const,
              apply: () => trySetEaRepository(applyResult.nextRepository),
              summary: `Import Technology CSV: imported ${objects.length} objects`,
            };
          },
        });
      },
      programmes: async (file: File) => {
        return importCsv({
          label: 'Import Programmes CSV',
          file,
          parse: (csvText) => {
            if (!eaRepository) return { ok: false as const, errors: ['No repository loaded.'] };
            const defaultLifecycleState = defaultLifecycleStateForLifecycleCoverage(metadata?.lifecycleCoverage);
            const result = parseAndValidateProgrammesCsv(csvText);
            if (!result.ok) return result;

            const objects = (result.programmes as any[]).map((p: any) => ({
              id: p.id,
              type: 'Programme' as const,
              attributes: {
                name: p.name,
                lifecycleState: (p.attributes ?? {})?.lifecycleState ?? defaultLifecycleState,
                ...(p.attributes ?? {}),
              },
            }));

            const applyResult = applyEaImportBatch(eaRepository, { objects });
            if (!applyResult.ok) return { ok: false as const, errors: applyResult.errors };

            return {
              ok: true as const,
              apply: () => trySetEaRepository(applyResult.nextRepository),
              summary: `Import Programmes CSV: imported ${objects.length} objects`,
            };
          },
        });
      },
    };
  }, [eaRepository, importCsv, metadata?.lifecycleCoverage, trySetEaRepository]);

  const fileMenuDisabled = false;
  const editMenuDisabled = !hasRepo;
  const governanceMenuDisabled = !hasRepo;

  const items = React.useMemo(
    () => [
      {
        key: 'file',
        label: 'File',
        children: [
          { key: 'file.new', label: 'New EA Repository', onClick: handleNewRepo },
          { key: 'file.open', label: 'Open EA Repository…', onClick: handleOpenRepo },
          { type: 'divider' as const },
          {
            key: 'file.close',
            label: 'Close Repository',
            disabled: !hasRepo,
            onClick: handleCloseRepository,
          },
          {
            key: 'file.import',
            label: 'Import',
            disabled: !hasRepo,
            children: [
              {
                key: 'file.import.cap',
                label: 'Import Capabilities CSV…',
                disabled: !canImportCapabilities,
                onClick: handleImportCapabilitiesCsv,
              },
              { key: 'file.import.apps', label: 'Import Applications CSV…', onClick: handleImportApplicationsCsv },
              { key: 'file.import.deps', label: 'Import Dependencies CSV…', onClick: handleImportDependenciesCsv },
              {
                key: 'file.import.tech',
                label: 'Import Technology CSV…',
                disabled: !canImportTechnology,
                onClick: handleImportTechnologyCsv,
              },
              {
                key: 'file.import.prog',
                label: 'Import Programmes CSV…',
                disabled: !canImportProgrammes,
                onClick: handleImportProgrammesCsv,
              },
            ],
          },
          {
            key: 'file.export',
            label: 'Export',
            disabled: !hasRepo,
            children: [
              { key: 'file.export.snapshot', label: 'Export Repository Snapshot (JSON)', onClick: handleExportRepositorySnapshot },
              { key: 'file.export.impact', label: 'Export Impact Analysis (CSV)', onClick: handleExportImpactAnalysisCsv },
            ],
          },
          { type: 'divider' as const },
          { key: 'file.exit', label: 'Exit', onClick: handleExit },
        ],
      },
      {
        key: 'edit',
        label: 'Edit',
        disabled: editMenuDisabled,
        children: [
          { key: 'edit.undo', label: 'Undo', disabled: !hasRepo || !canUndo, onClick: handleUndo },
          { key: 'edit.redo', label: 'Redo', disabled: !hasRepo || !canRedo, onClick: handleRedo },
          { type: 'divider' as const },
          {
            key: 'edit.rename',
            label: 'Rename Selected Element…',
            disabled: !selectedEntityId || !canEditSelectedEntity,
            onClick: handleRenameSelectedElement,
          },
          {
            key: 'edit.delete',
            label: 'Delete Selected Element…',
            disabled: !selectedEntityId || !canEditSelectedEntity,
            onClick: handleDeleteSelectedElement,
            danger: true,
          },
          { type: 'divider' as const },
          { key: 'edit.find', label: 'Find Element…', onClick: handleFindElement },
          { key: 'edit.pref', label: 'Preferences', onClick: handlePreferences },
        ],
      },
      {
        key: 'view',
        label: 'View',
        children: [
          { key: 'view.explorer', label: 'Toggle Explorer', onClick: handleToggleExplorer },
          { key: 'view.diagrams', label: 'Toggle Diagrams Panel', onClick: handleToggleDiagrams },
          { key: 'view.analysis', label: 'Toggle Analysis Panel', onClick: handleToggleAnalysis },
          { key: 'view.gov', label: 'Toggle Governance Panel', onClick: handleToggleGovernance },
          { key: 'view.bottom', label: 'Toggle Bottom Panel', onClick: handleToggleBottomPanel },
          { type: 'divider' as const },
          { key: 'view.reset', label: 'Reset Layout', onClick: handleResetLayout },
          { key: 'view.full', label: 'Fullscreen Workspace', onClick: handleFullscreenWorkspace },
        ],
      },
      {
        key: 'governance',
        label: 'Governance',
        disabled: governanceMenuDisabled,
        children: [
          { key: 'gov.principles', label: 'Architecture Principles', onClick: () => handleGovernancePlaceholder('Architecture Principles') },
          { key: 'gov.standards', label: 'Standards & Policies', onClick: () => handleGovernancePlaceholder('Standards & Policies') },
          { key: 'gov.rules', label: 'Compliance Rules', onClick: () => handleGovernancePlaceholder('Compliance Rules') },
          { key: 'gov.checks', label: 'Validation Checks', onClick: () => handleGovernancePlaceholder('Validation Checks') },
          { key: 'gov.audit', label: 'Audit Log', onClick: () => handleGovernancePlaceholder('Audit Log (read-only)') },
          { type: 'divider' as const },
          { key: 'gov.dashboard', label: 'Governance Dashboard', onClick: handleGovernanceDashboard },
        ],
      },
      {
        key: 'tools',
        label: 'Tools',
        children: [
          { key: 'tools.import', label: 'Import / Export (CSV / Excel)', onClick: handleToolsImportWizard },
          {
            key: 'tools.csv',
            label: 'CSV Validator',
            onClick: () => {
              console.log('[IDE] Tools > CSV Validator');
              notification.info({
                message: 'CSV Validator',
                description: 'Use File → Import to validate entity-specific CSVs. A dedicated validator UI is planned.',
                placement: 'bottomRight',
              });
            },
          },
          { key: 'tools.seed', label: 'Seed Sample Architecture', onClick: openSeedSampleDataModal },
          { key: 'tools.stats', label: 'Repository Statistics', onClick: handleToolsRepositoryStats, disabled: !hasRepo },
          { key: 'tools.meta', label: 'Schema / Metamodel Viewer', onClick: handleToolsMetamodelViewer },
          { key: 'tools.reset', label: 'Cache / State Reset', onClick: handleToolsCacheReset },
          {
            key: 'tools.dev',
            label: 'Developer Diagnostics',
            disabled: process.env.NODE_ENV !== 'development',
            onClick: handleToolsDevDiagnostics,
          },
        ],
      },
      {
        key: 'help',
        label: 'Help',
        children: [
          { key: 'help.welcome', label: 'Welcome / Getting Started', onClick: handleHelpWelcome },
          { key: 'help.docs', label: 'Documentation', onClick: handleHelpDocs },
          { key: 'help.keys', label: 'Keyboard Shortcuts', onClick: handleHelpShortcuts },
          { key: 'help.ver', label: 'Version Info', onClick: handleHelpVersion },
          { type: 'divider' as const },
          { key: 'help.about', label: 'About', onClick: handleHelpAbout },
        ],
      },
    ],
    [
      canRedo,
      canUndo,
      editMenuDisabled,
      governanceMenuDisabled,
      handleCloseRepository,
      handleDeleteSelectedElement,
      handleExit,
      handleExportImpactAnalysisCsv,
      handleExportRepositorySnapshot,
      handleFindElement,
      handleFullscreenWorkspace,
      handleGovernanceDashboard,
      handleGovernancePlaceholder,
      handleHelpAbout,
      handleHelpDocs,
      handleHelpShortcuts,
      handleHelpVersion,
      handleHelpWelcome,
      handleImportApplicationsCsv,
      handleImportCapabilitiesCsv,
      handleImportDependenciesCsv,
      handleImportProgrammesCsv,
      handleImportTechnologyCsv,
      handleNewRepo,
      handleOpenRepo,
      handlePreferences,
      handleRedo,
      handleRenameSelectedElement,
      handleResetLayout,
      handleToggleAnalysis,
      handleToggleBottomPanel,
      handleToggleDiagrams,
      handleToggleExplorer,
      handleToggleGovernance,
      handleToolsImportWizard,
      handleUndo,
      hasRepo,
      openSeedSampleDataModal,
      selectedEntityId,
    ],
  );

  const findMatches = React.useMemo(() => {
    if (!eaRepository) return [] as Array<{ id: string; type: string; name: string }>;
    const q = findQuery.trim().toLowerCase();
    if (!q) return [];

    const out: Array<{ id: string; type: string; name: string }> = [];
    for (const o of eaRepository.objects.values()) {
      const name = typeof o.attributes?.name === 'string' ? String(o.attributes.name) : '';
      const hay = `${o.id} ${name} ${o.type}`.toLowerCase();
      if (!hay.includes(q)) continue;
      out.push({ id: o.id, type: String(o.type), name: name || o.id });
      if (out.length >= 50) break;
    }
    return out;
  }, [eaRepository, findQuery]);

  // File input handlers (CSV)
  const onCsvSelected = (parser: (file: File) => Promise<void>) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await parser(file);
  };

  return (
    <div className={styles.root}>
      <Menu
        className={styles.menu}
        mode="horizontal"
        theme="light"
        selectable={false}
        items={items as any}
        disabled={fileMenuDisabled ? true : false}
      />

      <div className={styles.right}>
        <span className={styles.hint}>
          {hasRepo ? `Repository: ${metadata?.organizationName ?? 'Loaded'}` : 'No repository loaded'}
        </span>
      </div>

      {/* Hidden inputs */}
      <input
        ref={openRepoInputRef}
        type="file"
        accept="application/json,.json,application/zip,.zip"
        style={{ display: 'none' }}
        onChange={handleOpenRepoFileSelected}
      />

      <input ref={importCapabilitiesInputRef} type="file" accept="text/csv,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls" style={{ display: 'none' }} onChange={onCsvSelected(parseAndApplyCsv.capabilities)} />
      <input ref={importApplicationsInputRef} type="file" accept="text/csv,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls" style={{ display: 'none' }} onChange={onCsvSelected(parseAndApplyCsv.applications)} />
      <input ref={importDependenciesInputRef} type="file" accept="text/csv,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls" style={{ display: 'none' }} onChange={onCsvSelected(parseAndApplyCsv.dependencies)} />
      <input ref={importTechnologyInputRef} type="file" accept="text/csv,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls" style={{ display: 'none' }} onChange={onCsvSelected(parseAndApplyCsv.technology)} />
      <input ref={importProgrammesInputRef} type="file" accept="text/csv,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls" style={{ display: 'none' }} onChange={onCsvSelected(parseAndApplyCsv.programmes)} />

      {/* New repo modal */}
      <Modal
        title="New EA Repository"
        open={newRepoOpen}
        onCancel={() => setNewRepoOpen(false)}
        onOk={handleConfirmNewRepo}
        okText="Create"
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ marginBottom: 6 }}>Organization name</div>
            <Input
              value={newRepoDraft.organizationName}
              onChange={(e) => setNewRepoDraft((p) => ({ ...p, organizationName: e.target.value }))}
              placeholder="e.g. Contoso"
            />
          </div>
          <div>
            <div style={{ marginBottom: 6 }}>Industry</div>
            <Input
              value={newRepoDraft.industry}
              onChange={(e) => setNewRepoDraft((p) => ({ ...p, industry: e.target.value }))}
              placeholder="e.g. Financial Services"
            />
          </div>
          <div>
            <div style={{ marginBottom: 6 }}>Scope</div>
            <Select
              value={newRepoDraft.architectureScope}
              onChange={(value) =>
                setNewRepoDraft((p) => ({ ...p, architectureScope: value as NewRepoDraft['architectureScope'] }))
              }
              options={[
                { value: 'Enterprise', label: 'Enterprise' },
                { value: 'Business Unit', label: 'Business Unit' },
                { value: 'Domain', label: 'Domain' },
                { value: 'Programme', label: 'Programme' },
              ]}
            />
          </div>
          <div>
            <div style={{ marginBottom: 6 }}>Architecture framework</div>
            <Select
              value={newRepoDraft.referenceFramework}
              onChange={(value) =>
                setNewRepoDraft((p) => ({ ...p, referenceFramework: value as NewRepoDraft['referenceFramework'] }))
              }
              options={[
                { value: 'TOGAF', label: 'TOGAF' },
                { value: 'Custom', label: 'Custom' },
                { value: 'ArchiMate', label: 'ArchiMate' },
              ]}
            />
          </div>
          <div>
            <div style={{ marginBottom: 6 }}>Time horizon</div>
            <Select
              value={newRepoDraft.timeHorizon}
              onChange={(value) => setNewRepoDraft((p) => ({ ...p, timeHorizon: value as NewRepoDraft['timeHorizon'] }))}
              options={[
                { value: 'Current', label: 'Current' },
                { value: '1–3 years', label: '1–3 years' },
                { value: 'Strategic', label: 'Strategic' },
              ]}
            />
          </div>

          <div style={{ opacity: 0.75, marginTop: 4 }}>
            Creates metadata only; no architecture elements are created automatically.
          </div>
        </div>
      </Modal>

      {/* Rename modal */}
      <Modal
        title="Rename Selected Element"
        open={renameOpen}
        onCancel={() => setRenameOpen(false)}
        onOk={handleConfirmRename}
        okText="Rename"
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>New name</div>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
        </div>
      </Modal>

      {/* Find modal */}
      <Modal
        title="Find Element"
        open={findOpen}
        onCancel={() => setFindOpen(false)}
        footer={null}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Input value={findQuery} onChange={(e) => setFindQuery(e.target.value)} placeholder="Search by id, name, type…" autoFocus />
          <div style={{ maxHeight: 280, overflow: 'auto' }}>
            {findMatches.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No matches.</div>
            ) : (
              <List
                size="small"
                dataSource={findMatches}
                renderItem={(m) => (
                  <List.Item
                    actions={[
                      <Button
                        key="open"
                        type="link"
                        onClick={() => {
                          setFindOpen(false);
                          setSelection({ kind: 'repositoryElement', keys: [`repo:entity:${m.id}`] });
                          dispatchIdeCommand({
                            type: 'navigation.openWorkspace',
                            args: { type: 'object', objectId: m.id, objectType: m.type, name: m.name },
                          });
                        }}
                      >
                        Open
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={<Typography.Text strong>{m.name}</Typography.Text>}
                      description={
                        <Typography.Text type="secondary">
                          {m.type} · {m.id}
                        </Typography.Text>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default IdeMenuBar;
