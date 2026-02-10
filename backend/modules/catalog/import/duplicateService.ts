// ─── Duplicate Detection Service ──────────────────────────────────────────
// Detects duplicate records against existing repository elements.
// Match by name (case-insensitive) or applicationCode.

import type { Application } from '../../../repository/Application';
import { getRepository } from '../../../repository/RepositoryStore';
import type { DuplicateStrategy, ImportRecord } from './import.types';

export type DuplicateMatch = {
  importRowIndex: number;
  existingElementId: string;
  existingElementName: string;
  matchedBy: 'name' | 'applicationCode';
  strategy: DuplicateStrategy;
};

/**
 * Build an index of existing applications for fast duplicate lookup.
 */
function buildExistingIndex() {
  const repo = getRepository();
  const applications = repo.getElementsByType('applications') as Application[];

  const byName = new Map<string, Application>();
  const byCode = new Map<string, Application>();

  for (const app of applications) {
    const nameKey = app.name.trim().toLowerCase();
    if (nameKey) byName.set(nameKey, app);

    const codeKey = (app.applicationCode ?? '').trim().toLowerCase();
    if (codeKey) byCode.set(codeKey, app);
  }

  return { byName, byCode };
}

/**
 * Detect duplicates in a batch of import records.
 * Mutates records in-place to set duplicate status and match info.
 */
export function detectDuplicates(
  records: ImportRecord[],
  defaultStrategy: DuplicateStrategy = 'UPDATE_EXISTING',
): DuplicateMatch[] {
  const { byName, byCode } = buildExistingIndex();
  const matches: DuplicateMatch[] = [];

  for (const record of records) {
    if (record.status === 'INVALID') continue;

    const mapped = record.mapped as Record<string, string>;

    // First, match by applicationCode if available.
    const code = (mapped.applicationCode ?? '').trim().toLowerCase();
    if (code && byCode.has(code)) {
      const existing = byCode.get(code);
      if (!existing) continue;
      record.status = 'DUPLICATE';
      record.duplicateOf = existing.id;
      record.duplicateStrategy = defaultStrategy;
      matches.push({
        importRowIndex: record.rowIndex,
        existingElementId: existing.id,
        existingElementName: existing.name,
        matchedBy: 'applicationCode',
        strategy: defaultStrategy,
      });
      continue;
    }

    // Second, match by name (case-insensitive).
    const name = (mapped.name ?? '').trim().toLowerCase();
    if (name && byName.has(name)) {
      const existing = byName.get(name);
      if (!existing) continue;
      record.status = 'DUPLICATE';
      record.duplicateOf = existing.id;
      record.duplicateStrategy = defaultStrategy;
      matches.push({
        importRowIndex: record.rowIndex,
        existingElementId: existing.id,
        existingElementName: existing.name,
        matchedBy: 'name',
        strategy: defaultStrategy,
      });
    }
  }

  return matches;
}

/**
 * Get an existing application by ID for side-by-side preview.
 */
export function getExistingApplication(
  elementId: string,
): Application | undefined {
  const repo = getRepository();
  const element = repo.getElementById(elementId);
  return element?.elementType === 'Application'
    ? (element as Application)
    : undefined;
}
