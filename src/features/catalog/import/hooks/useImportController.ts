// ─── useImportController ──────────────────────────────────────────────────
// Central hook that orchestrates the entire CSV import workflow.

import React from 'react';
import { useEaRepository } from '@/ea/EaRepositoryContext';
import { getRepositoryApplications } from '@/services/ea/repository';
import {
  executeImport as executeImportApi,
  parseCsvContent,
  suggestMappings,
  validateImportData,
} from '../services/import.api';
import type {
  ColumnMapping,
  DuplicateMatch,
  DuplicateStrategy,
  ImportBatch,
  ImportRecord,
  ImportStep,
  TargetField,
} from '../types/import.types';

export type ImportState = {
  // Stepper
  currentStep: ImportStep;
  loading: boolean;
  error: string | null;

  // Step 1: Upload
  fileName: string;
  csvContent: string;
  csvHeaders: string[];
  csvPreview: Record<string, string>[];
  totalRows: number;
  parseErrors: string[];

  // Step 2: Mapping
  mappings: ColumnMapping[];
  targetFields: TargetField[];

  // Step 3: Validation
  validRecords: ImportRecord[];
  invalidRecords: ImportRecord[];
  duplicateRecords: ImportRecord[];
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  duplicateMatches: DuplicateMatch[];

  // Step 5: Summary
  importResult: ImportBatch | null;
};

const INITIAL_STATE: ImportState = {
  currentStep: 'upload',
  loading: false,
  error: null,
  fileName: '',
  csvContent: '',
  csvHeaders: [],
  csvPreview: [],
  totalRows: 0,
  parseErrors: [],
  mappings: [],
  targetFields: [],
  validRecords: [],
  invalidRecords: [],
  duplicateRecords: [],
  validCount: 0,
  invalidCount: 0,
  duplicateCount: 0,
  duplicateMatches: [],
  importResult: null,
};

export function useImportController() {
  const [state, setState] = React.useState<ImportState>(INITIAL_STATE);
  const { eaRepository, trySetEaRepository } = useEaRepository();

  const setPartial = (patch: Partial<ImportState>) =>
    setState((prev) => ({ ...prev, ...patch }));

  // ─── Step 1: Upload & Parse ─────────────────────────────────────────

  const uploadCsv = React.useCallback(
    async (fileName: string, content: string) => {
      setPartial({ loading: true, error: null, fileName, csvContent: content });

      try {
        const res = await parseCsvContent(content);
        if (!res.success) {
          setPartial({
            loading: false,
            error: res.errorMessage ?? 'Parse failed.',
          });
          return;
        }

        const { headers, preview, totalRows, parseErrors } = res.data;

        // Auto-fetch mappings immediately.
        const mapRes = await suggestMappings(headers);
        const mappings = mapRes.success ? mapRes.data.mappings : [];
        const targetFields = mapRes.success ? mapRes.data.targetFields : [];

        setPartial({
          loading: false,
          csvHeaders: headers,
          csvPreview: preview,
          totalRows,
          parseErrors,
          mappings,
          targetFields,
          currentStep: 'mapping',
        });
      } catch (err) {
        setPartial({
          loading: false,
          error: `Upload failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    },
    [],
  );

  // ─── Step 2: Update Mappings ────────────────────────────────────────

  const updateMapping = React.useCallback(
    (csvHeader: string, targetField: string) => {
      setState((prev) => ({
        ...prev,
        mappings: prev.mappings.map((m) =>
          m.csvHeader === csvHeader ? { ...m, targetField } : m,
        ),
      }));
    },
    [],
  );

  const confirmMappings = React.useCallback(async () => {
    setPartial({ loading: true, error: null });

    try {
      const { mappings: currentMappings, csvContent } = state;

      if (!currentMappings.length || !csvContent) {
        setPartial({ error: 'Validation failed to start.' });
        return;
      }

      console.debug('Import validation mappings:', currentMappings);
      console.debug('Import validation CSV length:', csvContent.length);

      const res = await validateImportData(
        currentMappings,
        'UPDATE_EXISTING',
        csvContent,
      );

      if (!res.success) {
        setPartial({
          error: res.errorMessage ?? 'Validation failed.',
        });
        return;
      }

      setPartial({
        validRecords: res.data.validRecords,
        invalidRecords: res.data.invalidRecords,
        duplicateRecords: res.data.duplicateRecords,
        validCount: res.data.validCount,
        invalidCount: res.data.invalidCount,
        duplicateCount: res.data.duplicateCount,
        duplicateMatches: res.data.duplicateMatches,
        currentStep: 'validation',
      });
    } catch (err) {
      setPartial({
        error: `Validation failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setPartial({ loading: false });
    }
  }, [state]);

  // ─── Step 3: Proceed from Validation ────────────────────────────────

  const proceedFromValidation = React.useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: prev.duplicateCount > 0 ? 'duplicates' : 'summary',
    }));
  }, []);

  // ─── Step 4: Update Duplicate Strategy ──────────────────────────────

  const updateDuplicateStrategy = React.useCallback(
    (rowIndex: number, strategy: DuplicateStrategy) => {
      setState((prev) => ({
        ...prev,
        duplicateRecords: prev.duplicateRecords.map((r) =>
          r.rowIndex === rowIndex ? { ...r, duplicateStrategy: strategy } : r,
        ),
      }));
    },
    [],
  );

  const proceedFromDuplicates = React.useCallback(() => {
    setPartial({ currentStep: 'summary' });
  }, []);

  // ─── Step 5: Execute Import ─────────────────────────────────────────

  const runImport = React.useCallback(async () => {
    setPartial({ loading: true, error: null });

    try {
      const { validRecords, duplicateRecords, fileName } = state;

      if (!validRecords.length && !duplicateRecords.length) {
        setPartial({ error: 'No records to import.' });
        return;
      }

      console.debug('Import execute counts:', {
        valid: validRecords.length,
        duplicate: duplicateRecords.length,
        fileName,
      });

      const res = await executeImportApi({
        validRecords,
        duplicateRecords,
        fileName,
        userId: 'current-user',
      });

      if (!res.success) {
        setPartial({
          loading: false,
          error: res.errorMessage ?? 'Import failed.',
        });
        return;
      }

      setPartial({ importResult: res.data });

      if (eaRepository) {
        const now = new Date().toISOString();
        const makeId = () => {
          try {
            if (typeof globalThis.crypto?.randomUUID === 'function') {
              return globalThis.crypto.randomUUID();
            }
          } catch {
            // Fallback below.
          }
          return `app-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2)}`;
        };

        const hasEnterpriseRoot = (repo: typeof eaRepository) => {
          for (const obj of repo.objects.values()) {
            if (obj.type !== 'Enterprise') continue;
            if ((obj.attributes as any)?._deleted === true) continue;
            return true;
          }
          return false;
        };

        let baseRepo = eaRepository.clone();
        if (!hasEnterpriseRoot(baseRepo)) {
          const initRepo = baseRepo.clone();
          const enterpriseId = makeId();
          initRepo.addObject({
            id: enterpriseId,
            type: 'Enterprise',
            attributes: {
              name: 'Enterprise',
              elementType: 'Enterprise',
              createdAt: now,
              lastModifiedAt: now,
            },
          });

          const initApply = trySetEaRepository(initRepo);
          if (!initApply.ok) {
            setPartial({
              error: `Import succeeded, but the local repository could not be initialized: ${initApply.error}`,
            });
            return;
          }
          baseRepo = initRepo;
        }

        const applyRecord = (
          record: ImportRecord,
          strategy: DuplicateStrategy,
          next: typeof eaRepository,
        ) => {
          if (strategy === 'SKIP') return;

          const baseAttrs = {
            ...record.mapped,
            name: String((record.mapped as any)?.name ?? '').trim(),
            elementType: 'Application',
            lastModifiedAt: now,
          } as Record<string, unknown>;

          if (!baseAttrs.name) return;

          if (strategy === 'UPDATE_EXISTING' && record.duplicateOf) {
            next.updateObjectAttributes(record.duplicateOf, baseAttrs, 'merge');
            return;
          }

          let nextId = String((record.mapped as any)?.id ?? '').trim();
          if (!nextId) nextId = makeId();

          if (next.objects.has(nextId)) {
            nextId = makeId();
          }

          if (!('createdAt' in baseAttrs)) {
            baseAttrs.createdAt = now;
          }

          next.addObject({
            id: nextId,
            type: 'Application',
            attributes: baseAttrs,
          });
        };

        const next = baseRepo.clone();

        let backendApps: Array<Record<string, unknown>> | null = null;
        try {
          const repoRes = await getRepositoryApplications();
          if (repoRes.success && Array.isArray(repoRes.data)) {
            backendApps = repoRes.data as Array<Record<string, unknown>>;
          }
        } catch {
          // Best-effort only.
        }

        if (backendApps && backendApps.length > 0) {
          console.debug('Repository sync applications:', backendApps.length);
          backendApps.forEach((app) => {
            const id = String((app as any).id ?? '').trim();
            if (!id) return;
            const attrs = { ...app } as Record<string, unknown>;
            delete (attrs as any).id;
            (attrs as any).elementType = 'Application';
            if (!('createdAt' in attrs)) (attrs as any).createdAt = now;
            (attrs as any).lastModifiedAt = now;

            if (next.objects.has(id)) {
              next.updateObjectAttributes(id, attrs, 'merge');
            } else {
              next.addObject({ id, type: 'Application', attributes: attrs });
            }
          });
        } else {
          validRecords.forEach((record) => {
            applyRecord(record, 'CREATE_NEW', next);
          });
          duplicateRecords.forEach((record) => {
            applyRecord(
              record,
              record.duplicateStrategy ?? 'UPDATE_EXISTING',
              next,
            );
          });
        }

        const applied = trySetEaRepository(next);
        if (!applied.ok) {
          setPartial({
            error: `Import succeeded, but the local repository could not be updated: ${applied.error}`,
          });
        }
      }

      // Fire repository change event so catalog and explorer refresh.
      try {
        window.dispatchEvent(new Event('ea:repositoryChanged'));
      } catch {
        // Best-effort.
      }
    } catch (err) {
      setPartial({
        error: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setPartial({ loading: false });
    }
  }, [state, eaRepository, trySetEaRepository]);

  // ─── Navigation ─────────────────────────────────────────────────────

  const goToStep = React.useCallback((step: ImportStep) => {
    setPartial({ currentStep: step, error: null });
  }, []);

  const reset = React.useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    state,
    uploadCsv,
    updateMapping,
    confirmMappings,
    proceedFromValidation,
    updateDuplicateStrategy,
    proceedFromDuplicates,
    runImport,
    goToStep,
    reset,
  };
}
