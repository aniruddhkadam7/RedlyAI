import { zipSync } from 'fflate';
import type {
  RepositoryDiagramRecord,
  RepositoryElementRecord,
  RepositoryLayoutsRecord,
  RepositoryPackageBaselineRecord,
  RepositoryPackageData,
  RepositoryPackageManifest,
  RepositoryPackageSource,
  RepositoryRelationshipRecord,
  RepositoryWorkspaceRecord,
} from './packageTypes';
import {
  concatBytes,
  jsonToBytes,
  sha256Hex,
  verifyZipHeader,
} from './packageUtils';

/** DEFLATE compression level for all ZIP entries. */
const ZIP_DEFLATE_LEVEL = 6;

const EXPORT_VERSION = 1;
const DEFAULT_SCHEMA_VERSION = '1';

const safeString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const extractName = (attributes: Record<string, unknown>): string | null => {
  const raw = attributes?.name;
  return safeString(raw);
};

const extractCreatedAt = (
  attributes: Record<string, unknown>,
): string | null => {
  return (
    safeString(attributes?.createdAt) || safeString(attributes?.created_on)
  );
};

const extractUpdatedAt = (
  attributes: Record<string, unknown>,
): string | null => {
  return (
    safeString(attributes?.updatedAt) ||
    safeString(attributes?.lastModifiedAt) ||
    safeString(attributes?.updated_on)
  );
};

const buildElements = (
  objects: RepositoryPackageSource['objects'],
): RepositoryElementRecord[] =>
  objects.map((obj) => {
    const properties = { ...(obj.attributes ?? {}) };
    return {
      id: obj.id,
      type: obj.type,
      name: extractName(properties),
      properties,
      workspaceId: obj.workspaceId,
      createdAt: extractCreatedAt(properties) ?? undefined,
      updatedAt: extractUpdatedAt(properties) ?? undefined,
    };
  });

const buildRelationships = (
  relationships: RepositoryPackageSource['relationships'],
): RepositoryRelationshipRecord[] =>
  relationships.map((rel) => ({
    id:
      typeof rel.id === 'string' && rel.id.trim()
        ? rel.id.trim()
        : `rel-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    sourceId: rel.fromId,
    targetId: rel.toId,
    type: rel.type,
    properties: { ...(rel.attributes ?? {}) },
  }));

const buildDiagrams = (
  views: RepositoryPackageSource['views'],
): RepositoryDiagramRecord[] =>
  views.map((view) => {
    const scope = view.scope as any;
    const referencedElementIds =
      scope?.kind === 'ManualSelection' && Array.isArray(scope.elementIds)
        ? scope.elementIds.map((id: unknown) => String(id)).filter(Boolean)
        : [];

    return {
      id: view.id,
      title: view.name,
      viewpointId: view.viewpointId,
      description: view.description,
      scope: view.scope,
      referencedElementIds,
      createdAt: view.createdAt,
      createdBy: view.createdBy,
      layoutMetadata: view.layoutMetadata
        ? { ...view.layoutMetadata }
        : undefined,
      visibleRelationshipIds: Array.isArray(view.visibleRelationshipIds)
        ? [...view.visibleRelationshipIds]
        : undefined,
    };
  });

const buildWorkspace = (
  source: RepositoryPackageSource,
): RepositoryWorkspaceRecord => ({
  schemaVersion: source.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
  repositoryMetadata: { ...source.metadata },
  repositoryId: source.repositoryId,
  updatedAt: new Date().toISOString(),
  designWorkspaces: source.designWorkspaces ?? [],
  baselines: source.baselines ?? [],
});

const buildBaselines = (
  baselines: RepositoryPackageSource['baselines'],
): RepositoryPackageBaselineRecord[] => {
  if (!Array.isArray(baselines)) return [];
  return baselines
    .filter((b) => b && typeof (b as any).id === 'string')
    .map((b) => {
      const base = b as any;
      return {
        id: String(base.id),
        name: String(base.name ?? 'Baseline'),
        description:
          typeof base.description === 'string' ? base.description : undefined,
        createdAt: String(base.createdAt ?? new Date().toISOString()),
        createdBy:
          typeof base.createdBy === 'string' ? base.createdBy : undefined,
        elementCount: Number(base.elementCount ?? base.elements?.length ?? 0),
        relationshipCount: Number(
          base.relationshipCount ?? base.relationships?.length ?? 0,
        ),
        diagramCount: Number(
          base.diagramCount ?? base.snapshot?.diagrams?.length ?? 0,
        ),
        snapshot: base.snapshot,
      } as RepositoryPackageBaselineRecord;
    });
};

// ---------------------------------------------------------------------------
// Pre-packaging validation — checks referential integrity and completeness
// ---------------------------------------------------------------------------
const validateExportData = (args: {
  elements: RepositoryElementRecord[];
  relationships: RepositoryRelationshipRecord[];
  diagrams: RepositoryDiagramRecord[];
  layouts: RepositoryLayoutsRecord;
  baselines: RepositoryPackageBaselineRecord[];
  designWorkspaces: unknown[] | undefined;
}): string[] => {
  const warnings: string[] = [];
  const elementIds = new Set(args.elements.map((e) => e.id));

  // --- element sanity ---
  if (args.elements.length === 0) {
    warnings.push('Repository contains zero elements — package will be empty.');
  }
  const duplicateElementIds = findDuplicates(args.elements.map((e) => e.id));
  if (duplicateElementIds.length > 0) {
    warnings.push(
      `Duplicate element ids detected: ${duplicateElementIds.join(', ')}`,
    );
  }

  // --- relationship integrity ---
  const duplicateRelIds = findDuplicates(args.relationships.map((r) => r.id));
  if (duplicateRelIds.length > 0) {
    warnings.push(
      `Duplicate relationship ids detected: ${duplicateRelIds.join(', ')}`,
    );
  }
  for (const rel of args.relationships) {
    if (!elementIds.has(rel.sourceId)) {
      warnings.push(
        `Relationship ${rel.id} references missing source element: ${rel.sourceId}`,
      );
    }
    if (!elementIds.has(rel.targetId)) {
      warnings.push(
        `Relationship ${rel.id} references missing target element: ${rel.targetId}`,
      );
    }
  }

  // --- diagram integrity ---
  const diagramIds = new Set(args.diagrams.map((d) => d.id));
  const duplicateDiagramIds = findDuplicates(args.diagrams.map((d) => d.id));
  if (duplicateDiagramIds.length > 0) {
    warnings.push(
      `Duplicate diagram ids detected: ${duplicateDiagramIds.join(', ')}`,
    );
  }
  for (const diagram of args.diagrams) {
    if (diagram.referencedElementIds) {
      for (const refId of diagram.referencedElementIds) {
        if (!elementIds.has(refId)) {
          warnings.push(
            `Diagram "${diagram.title}" (${diagram.id}) references missing element: ${refId}`,
          );
        }
      }
    }
  }

  // --- layout integrity: all layout viewIds must reference an existing diagram ---
  const layoutViewIds = Object.keys(args.layouts.viewLayouts ?? {});
  for (const viewId of layoutViewIds) {
    if (!diagramIds.has(viewId)) {
      warnings.push(`Layout references missing diagram/view: ${viewId}`);
    }
    const positions = args.layouts.viewLayouts[viewId] ?? {};
    for (const elementId of Object.keys(positions)) {
      if (!elementIds.has(elementId)) {
        warnings.push(
          `Layout for view ${viewId} references missing element: ${elementId}`,
        );
      }
    }
  }

  // --- diagrams without layout data (informational) ---
  for (const diagram of args.diagrams) {
    if (!args.layouts.viewLayouts[diagram.id]) {
      // Not an error — empty diagrams are fine — but worth noting
      warnings.push(
        `Diagram "${diagram.title}" (${diagram.id}) has no layout positions (may be empty).`,
      );
    }
  }

  // --- baseline snapshot integrity ---
  for (const baseline of args.baselines) {
    if (baseline.snapshot) {
      const snap = baseline.snapshot;
      if (!Array.isArray(snap.elements)) {
        warnings.push(
          `Baseline "${baseline.name}" snapshot is missing elements.`,
        );
      }
      if (!Array.isArray(snap.relationships)) {
        warnings.push(
          `Baseline "${baseline.name}" snapshot is missing relationships.`,
        );
      }
      if (!Array.isArray(snap.diagrams)) {
        warnings.push(
          `Baseline "${baseline.name}" snapshot is missing diagrams.`,
        );
      }
    }
  }

  return warnings;
};

const findDuplicates = (ids: string[]): string[] => {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return Array.from(dupes);
};

// ---------------------------------------------------------------------------
// Export summary log — printed before ZIP creation for diagnostics
// ---------------------------------------------------------------------------
const logExportSummary = (
  manifest: RepositoryPackageManifest,
  warnings: string[],
): void => {
  const border = '═'.repeat(52);
  console.log(`\n╔${border}╗`);
  console.log(`║  Repository Export Summary                         ║`);
  console.log(`╠${border}╣`);
  console.log(
    `║  Elements:           ${String(manifest.elementCount).padStart(8)}                   ║`,
  );
  console.log(
    `║  Relationships:      ${String(manifest.relationshipCount).padStart(8)}                   ║`,
  );
  console.log(
    `║  Diagrams:           ${String(manifest.diagramCount).padStart(8)}                   ║`,
  );
  console.log(
    `║  Layouts:            ${String(manifest.layoutCount).padStart(8)}                   ║`,
  );
  console.log(
    `║  Baselines:          ${String(manifest.baselineCount).padStart(8)}                   ║`,
  );
  console.log(
    `║  Design Workspaces:  ${String(manifest.designWorkspaceCount).padStart(8)}                   ║`,
  );
  console.log(`╠${border}╣`);
  console.log(
    `║  Schema:  v${manifest.schemaVersion.padEnd(6)}  Tool: ${manifest.toolVersion.padEnd(15)}    ║`,
  );
  console.log(
    `║  Date:    ${manifest.exportDate.slice(0, 19).padEnd(25)}              ║`,
  );
  console.log(
    `║  Checksum: ${(manifest.checksum || '').slice(0, 16)}…                    ║`,
  );
  if (warnings.length > 0) {
    console.log(`╠${border}╣`);
    console.log(
      `║  ⚠ ${warnings.length} validation warning(s)                        ║`,
    );
  }
  console.log(`╚${border}╝\n`);
};

const buildPackageData = async (
  source: RepositoryPackageSource,
): Promise<RepositoryPackageData> => {
  const elements = buildElements(source.objects);
  const relationships = buildRelationships(source.relationships);
  const diagrams = buildDiagrams(source.views);
  const layouts: RepositoryLayoutsRecord = {
    viewLayouts: source.viewLayouts ?? {},
  };
  const workspace = buildWorkspace(source);
  const importHistory = { items: source.importHistory ?? [] };
  const versionHistory = { items: source.versionHistory ?? [] };
  const baselines = buildBaselines(source.baselines);

  // ---------------------------------------------------------------------------
  // Pre-packaging validation
  // ---------------------------------------------------------------------------
  const warnings = validateExportData({
    elements,
    relationships,
    diagrams,
    layouts,
    baselines,
    designWorkspaces: source.designWorkspaces,
  });

  if (warnings.length > 0) {
    console.warn('[Export] Validation warnings:');
    for (const w of warnings) console.warn('  •', w);
  }

  // ---------------------------------------------------------------------------
  // Compute checksum
  // ---------------------------------------------------------------------------
  const elementsBytes = jsonToBytes(elements);
  const relationshipsBytes = jsonToBytes(relationships);
  const diagramsBytes = jsonToBytes(diagrams);
  const layoutsBytes = jsonToBytes(layouts);
  const workspaceBytes = jsonToBytes(workspace);
  const importHistoryBytes = jsonToBytes(importHistory);
  const versionHistoryBytes = jsonToBytes(versionHistory);
  const baselinesBytes = jsonToBytes(baselines);

  const checksum = await sha256Hex(
    concatBytes([
      elementsBytes,
      relationshipsBytes,
      diagramsBytes,
      layoutsBytes,
      workspaceBytes,
      importHistoryBytes,
      versionHistoryBytes,
      baselinesBytes,
    ]),
  );

  // ---------------------------------------------------------------------------
  // Build manifest with full counts
  // ---------------------------------------------------------------------------
  const layoutViewIds = Object.keys(layouts.viewLayouts ?? {});
  const designWorkspaces = Array.isArray(source.designWorkspaces)
    ? source.designWorkspaces
    : [];

  const manifest: RepositoryPackageManifest = {
    exportVersion: EXPORT_VERSION,
    toolVersion: source.toolVersion,
    schemaVersion: source.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
    exportDate: source.exportDate ?? new Date().toISOString(),
    elementCount: elements.length,
    relationshipCount: relationships.length,
    diagramCount: diagrams.length,
    baselineCount: baselines.length,
    layoutCount: layoutViewIds.length,
    designWorkspaceCount: designWorkspaces.length,
    checksum,
  };

  // ---------------------------------------------------------------------------
  // Export summary log
  // ---------------------------------------------------------------------------
  logExportSummary(manifest, warnings);

  return {
    manifest,
    elements,
    relationships,
    diagrams,
    layouts,
    workspace,
    importHistory,
    versionHistory,
    baselines,
  };
};

/**
 * Build a DEFLATE-compressed ZIP archive from the package data using fflate's
 * synchronous `zipSync`. The output starts with the standard PK\x03\x04 header
 * and can be opened by any ZIP-compatible tool.
 */
const buildZipBytes = (data: RepositoryPackageData): Uint8Array => {
  const opt = { level: ZIP_DEFLATE_LEVEL } as const;

  const archive = zipSync({
    model: {
      'elements.json': [jsonToBytes(data.elements), opt],
      'relationships.json': [jsonToBytes(data.relationships), opt],
    },
    views: {
      'diagrams.json': [jsonToBytes(data.diagrams), opt],
      'layouts.json': [jsonToBytes(data.layouts), opt],
    },
    metadata: {
      'workspace.json': [jsonToBytes(data.workspace), opt],
      'import-history.json': [jsonToBytes(data.importHistory), opt],
      'version-history.json': [jsonToBytes(data.versionHistory), opt],
      'baselines.json': [jsonToBytes(data.baselines ?? []), opt],
    },
    'manifest.json': [jsonToBytes(data.manifest), opt],
  });

  // Sanity-check: ensure the output is a valid ZIP before returning.
  verifyZipHeader(archive);

  return archive;
};

export const buildRepositoryPackageBytes = async (
  source: RepositoryPackageSource,
): Promise<{ bytes: Uint8Array; manifest: RepositoryPackageManifest }> => {
  const data = await buildPackageData(source);
  const bytes = buildZipBytes(data);
  return { bytes, manifest: data.manifest };
};

export const writeRepositoryPackageZip = async (args: {
  source: RepositoryPackageSource;
  onChunk: (chunk: Uint8Array, final: boolean) => void;
}): Promise<RepositoryPackageManifest> => {
  const data = await buildPackageData(args.source);
  const bytes = buildZipBytes(data);

  // Emit the full ZIP as a single chunk (it's already in memory).
  args.onChunk(bytes, true);

  return data.manifest;
};
