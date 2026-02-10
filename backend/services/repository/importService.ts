import { strFromU8, unzip, unzipSync, zipSync } from 'fflate';
import type {
  RepositoryDiagramRecord,
  RepositoryElementRecord,
  RepositoryLayoutsRecord,
  RepositoryPackageBaselineRecord,
  RepositoryPackageData,
  RepositoryPackageImportHistory,
  RepositoryPackageManifest,
  RepositoryPackageVersionHistory,
  RepositoryRelationshipRecord,
  RepositoryWorkspaceRecord,
} from './packageTypes';
import { concatBytes, jsonToBytes, sha256Hex } from './packageUtils';

const SUPPORTED_EXPORT_VERSION = 1;
const CURRENT_SCHEMA_VERSION = 1;

type ParseResult =
  | { ok: true; data: RepositoryPackageData; warnings: string[] }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Path normalization — ZIP archives may store paths with various separators,
// leading slashes, or back-slashes depending on the tool that created them.
// ---------------------------------------------------------------------------
const normalizePath = (p: string): string =>
  p.replace(/\\/g, '/').replace(/^\/+/, '');

/**
 * Build a lookup map from the raw unzipped entries, normalizing all paths.
 * This ensures we can find `model/elements.json` regardless of whether fflate
 * returns it as `model/elements.json`, `/model/elements.json`, or similar.
 */
const buildFileMap = (
  raw: Record<string, Uint8Array>,
): Record<string, Uint8Array> => {
  const map: Record<string, Uint8Array> = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalized = normalizePath(key);
    // Skip directory entries (end with /)
    if (normalized.endsWith('/') || !value || value.length === 0) continue;
    map[normalized] = value;
  }
  return map;
};

const readJson = <T>(
  files: Record<string, Uint8Array>,
  filePath: string,
): T => {
  const bytes = files[normalizePath(filePath)];
  if (!bytes) {
    const available = Object.keys(files).join(', ');
    throw new Error(
      `Missing required file: ${filePath}. Available files: [${available}]`,
    );
  }
  const raw = strFromU8(bytes);
  return JSON.parse(raw) as T;
};

const readJsonOptional = <T>(
  files: Record<string, Uint8Array>,
  filePath: string,
  fallback: T,
): T => {
  const bytes = files[normalizePath(filePath)];
  if (!bytes) return fallback;
  const raw = strFromU8(bytes);
  return JSON.parse(raw) as T;
};

const normalizeSchemaVersion = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const validateManifest = (
  manifest: RepositoryPackageManifest,
): { ok: true; warnings: string[] } | { ok: false; error: string } => {
  if (manifest.exportVersion !== SUPPORTED_EXPORT_VERSION) {
    return {
      ok: false,
      error: `Unsupported exportVersion ${manifest.exportVersion}. Expected ${SUPPORTED_EXPORT_VERSION}.`,
    };
  }

  const warnings: string[] = [];
  const schemaVersion = normalizeSchemaVersion(manifest.schemaVersion);
  if (schemaVersion !== null && schemaVersion < CURRENT_SCHEMA_VERSION) {
    warnings.push(
      `Repository schema version ${schemaVersion} is older than current ${CURRENT_SCHEMA_VERSION}.`,
    );
  }
  if (schemaVersion !== null && schemaVersion > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Repository schema version ${schemaVersion} is newer than current ${CURRENT_SCHEMA_VERSION}.`,
    };
  }

  return { ok: true, warnings };
};

const validateReferences = (args: {
  elements: RepositoryElementRecord[];
  relationships: RepositoryRelationshipRecord[];
  diagrams: RepositoryDiagramRecord[];
  layouts: RepositoryLayoutsRecord;
}): string | null => {
  const elementIds = new Set(args.elements.map((e) => e.id));
  const relationshipIds = new Set<string>();
  const diagramIds = new Set<string>();

  for (const element of args.elements) {
    if (!element.id) return 'Element id is required.';
  }

  for (const rel of args.relationships) {
    if (!rel.id) return 'Relationship id is required.';
    if (relationshipIds.has(rel.id)) {
      return `Duplicate relationship id: ${rel.id}`;
    }
    relationshipIds.add(rel.id);

    if (!rel.sourceId) return 'Relationship sourceId is required.';
    if (!rel.targetId) return 'Relationship targetId is required.';

    if (!elementIds.has(rel.sourceId)) {
      return `Relationship references missing source element: ${rel.sourceId}`;
    }
    if (!elementIds.has(rel.targetId)) {
      return `Relationship references missing target element: ${rel.targetId}`;
    }
  }

  const viewIds = new Set(args.diagrams.map((d) => d.id));
  const layoutViews = Object.keys(args.layouts.viewLayouts ?? {});
  for (const viewId of layoutViews) {
    if (!viewIds.has(viewId)) {
      return `Layout references missing view: ${viewId}`;
    }
    const positions = args.layouts.viewLayouts[viewId] ?? {};
    for (const elementId of Object.keys(positions)) {
      if (!elementIds.has(elementId)) {
        return `Layout references missing element: ${elementId}`;
      }
    }
  }

  for (const diagram of args.diagrams) {
    if (!diagram.id) return 'Diagram id is required.';
    if (diagramIds.has(diagram.id)) {
      return `Duplicate diagram id: ${diagram.id}`;
    }
    diagramIds.add(diagram.id);
    if (diagram.referencedElementIds) {
      for (const elementId of diagram.referencedElementIds) {
        if (!elementIds.has(elementId)) {
          return `Diagram references missing element: ${elementId}`;
        }
      }
    }
    if (diagram.visibleRelationshipIds) {
      for (const relId of diagram.visibleRelationshipIds) {
        if (!relationshipIds.has(relId)) {
          return `Diagram references missing relationship: ${relId}`;
        }
      }
    }
  }

  const elementIdSet = new Set<string>();
  for (const element of args.elements) {
    if (elementIdSet.has(element.id)) {
      return `Duplicate element id: ${element.id}`;
    }
    elementIdSet.add(element.id);
  }

  return null;
};

const validateBaselines = (
  baselines: RepositoryPackageBaselineRecord[],
): string | null => {
  const ids = new Set<string>();
  for (const baseline of baselines) {
    if (!baseline.id) return 'Baseline id is required.';
    if (ids.has(baseline.id)) return `Duplicate baseline id: ${baseline.id}`;
    ids.add(baseline.id);
    if (baseline.snapshot) {
      const error = validateReferences({
        elements: baseline.snapshot.elements,
        relationships: baseline.snapshot.relationships,
        diagrams: baseline.snapshot.diagrams,
        layouts: baseline.snapshot.layouts,
      });
      if (error) return `Baseline ${baseline.id}: ${error}`;
    }
  }
  return null;
};

const validateChecksum = async (args: {
  files: Record<string, Uint8Array>;
  manifest: RepositoryPackageManifest;
}): Promise<string | null> => {
  const checksum = args.manifest.checksum;
  if (!checksum) return null;

  const f = args.files;
  const elements = f['model/elements.json'];
  const relationships = f['model/relationships.json'];
  const diagrams = f['views/diagrams.json'];
  const layouts = f['views/layouts.json'];
  const workspace = f['metadata/workspace.json'];
  const importHistory = f['metadata/import-history.json'];
  const versionHistory = f['metadata/version-history.json'];
  const baselines = f['metadata/baselines.json'];

  if (
    !elements ||
    !relationships ||
    !diagrams ||
    !layouts ||
    !workspace ||
    !importHistory ||
    !versionHistory
  ) {
    return 'Missing required files for checksum validation.';
  }

  const computed = await sha256Hex(
    concatBytes([
      elements,
      relationships,
      diagrams,
      layouts,
      workspace,
      importHistory,
      versionHistory,
      baselines ?? new Uint8Array(),
    ]),
  );

  if (computed && computed !== checksum) {
    return 'Checksum mismatch. Package may be corrupted.';
  }

  return null;
};

export const parseRepositoryPackageBytes = async (
  bytes: Uint8Array,
): Promise<ParseResult> => {
  // -----------------------------------------------------------------------
  // Step 0: Basic sanity — make sure we received actual bytes
  // -----------------------------------------------------------------------
  if (!bytes || bytes.length === 0) {
    return {
      ok: false,
      error: 'Empty file. Please select a valid .eapkg repository package.',
    };
  }

  // Ensure we have a real Uint8Array (Electron IPC may deliver a plain object)
  let safeBytes: Uint8Array;
  if (bytes instanceof Uint8Array) {
    safeBytes = bytes;
  } else if (ArrayBuffer.isView(bytes)) {
    safeBytes = new Uint8Array((bytes as ArrayBufferView).buffer);
  } else if (typeof (bytes as any).length === 'number') {
    // Plain object with numeric keys from IPC serialization
    safeBytes = new Uint8Array(
      Array.from(
        { length: (bytes as any).length },
        (_, i) => (bytes as any)[i],
      ),
    );
  } else {
    return {
      ok: false,
      error: 'Invalid file format. Could not read file bytes.',
    };
  }

  // Check ZIP magic header (PK\x03\x04)
  if (
    safeBytes.length < 4 ||
    safeBytes[0] !== 0x50 ||
    safeBytes[1] !== 0x4b ||
    safeBytes[2] !== 0x03 ||
    safeBytes[3] !== 0x04
  ) {
    return {
      ok: false,
      error:
        'This file is not a valid ZIP archive. Expected .eapkg file with ZIP format (PK header). ' +
        'The file may be corrupted or is not an .eapkg repository package.',
    };
  }

  try {
    // -----------------------------------------------------------------------
    // Step 1: Unzip the archive
    // -----------------------------------------------------------------------
    let rawFiles: Record<string, Uint8Array>;
    try {
      // Prefer async unzip
      rawFiles = await new Promise<Record<string, Uint8Array>>(
        (resolve, reject) => {
          unzip(safeBytes, (err, data) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(data as Record<string, Uint8Array>);
          });
        },
      );
    } catch (asyncErr) {
      // Fallback to sync unzip — some edge cases in browser environments
      // can cause the async worker to fail.
      console.warn(
        '[Import] Async unzip failed, trying sync fallback:',
        asyncErr,
      );
      try {
        rawFiles = unzipSync(safeBytes) as Record<string, Uint8Array>;
      } catch (syncErr) {
        return {
          ok: false,
          error:
            'Failed to extract ZIP archive. The file may be corrupted. ' +
            (syncErr instanceof Error ? syncErr.message : ''),
        };
      }
    }

    // Normalize paths (strip directory entries, normalize slashes)
    const files = buildFileMap(rawFiles);

    console.log('[Import] Extracted files:', Object.keys(files).join(', '));

    // -----------------------------------------------------------------------
    // Step 2: Validate required files exist
    // -----------------------------------------------------------------------
    const requiredFiles = [
      'manifest.json',
      'model/elements.json',
      'model/relationships.json',
    ];
    const missingRequired = requiredFiles.filter((f) => !files[f]);
    if (missingRequired.length > 0) {
      return {
        ok: false,
        error:
          `Invalid .eapkg package: missing required files: ${missingRequired.join(', ')}. ` +
          `Found: [${Object.keys(files).join(', ')}]`,
      };
    }

    // -----------------------------------------------------------------------
    // Step 3: Parse manifest
    // -----------------------------------------------------------------------
    const manifest = readJson<RepositoryPackageManifest>(
      files,
      'manifest.json',
    );

    const manifestCheck = validateManifest(manifest);
    if (!manifestCheck.ok) return manifestCheck;

    // -----------------------------------------------------------------------
    // Step 4: Checksum validation (best-effort — skip if files are missing)
    // -----------------------------------------------------------------------
    const checksumError = await validateChecksum({ files, manifest });
    if (checksumError) {
      // Log but treat as warning for resilience — don't block import
      console.warn('[Import] Checksum warning:', checksumError);
      manifestCheck.warnings.push(checksumError);
    }

    // -----------------------------------------------------------------------
    // Step 5: Parse all data files (required + optional with fallbacks)
    // -----------------------------------------------------------------------
    const elements = readJson<RepositoryElementRecord[]>(
      files,
      'model/elements.json',
    );
    const relationships = readJson<RepositoryRelationshipRecord[]>(
      files,
      'model/relationships.json',
    );

    // These files are important but may be absent in older packages
    const diagrams = readJsonOptional<RepositoryDiagramRecord[]>(
      files,
      'views/diagrams.json',
      [],
    );
    const layouts = readJsonOptional<RepositoryLayoutsRecord>(
      files,
      'views/layouts.json',
      { viewLayouts: {} },
    );
    const workspace = readJsonOptional<RepositoryWorkspaceRecord>(
      files,
      'metadata/workspace.json',
      {
        schemaVersion: manifest.schemaVersion || '1',
        repositoryMetadata: {},
      },
    );
    const importHistory = readJsonOptional<RepositoryPackageImportHistory>(
      files,
      'metadata/import-history.json',
      { items: [] },
    );
    const versionHistory = readJsonOptional<RepositoryPackageVersionHistory>(
      files,
      'metadata/version-history.json',
      { items: [] },
    );
    const baselines = readJsonOptional<RepositoryPackageBaselineRecord[]>(
      files,
      'metadata/baselines.json',
      [],
    );

    // -----------------------------------------------------------------------
    // Step 6: Basic structural validation
    // -----------------------------------------------------------------------
    if (!Array.isArray(elements)) {
      return { ok: false, error: 'Elements file is invalid (expected array).' };
    }

    if (!Array.isArray(relationships)) {
      return {
        ok: false,
        error: 'Relationships file is invalid (expected array).',
      };
    }

    if (!Array.isArray(diagrams)) {
      return { ok: false, error: 'Diagrams file is invalid (expected array).' };
    }

    // Ensure layouts has viewLayouts
    const safeLayouts: RepositoryLayoutsRecord =
      layouts &&
      typeof layouts === 'object' &&
      typeof (layouts as any).viewLayouts === 'object'
        ? layouts
        : { viewLayouts: {} };

    // Ensure workspace has repositoryMetadata
    const safeWorkspace: RepositoryWorkspaceRecord =
      workspace &&
      typeof workspace === 'object' &&
      typeof workspace.repositoryMetadata === 'object'
        ? workspace
        : {
            schemaVersion: manifest.schemaVersion || '1',
            repositoryMetadata: (workspace as any)?.repositoryMetadata ?? {},
            ...(workspace as any),
          };

    // -----------------------------------------------------------------------
    // Step 7: Referential integrity (warn, don't reject)
    // -----------------------------------------------------------------------
    const refError = validateReferences({
      elements,
      relationships,
      diagrams,
      layouts: safeLayouts,
    });
    if (refError) {
      console.warn('[Import] Reference integrity warning:', refError);
      manifestCheck.warnings.push(refError);
    }

    const baselineError = validateBaselines(baselines);
    if (baselineError) {
      console.warn('[Import] Baseline warning:', baselineError);
      manifestCheck.warnings.push(baselineError);
    }

    // -----------------------------------------------------------------------
    // Step 8: Return parsed data
    // -----------------------------------------------------------------------
    console.log(
      `[Import] Successfully parsed package: ${elements.length} elements, ` +
        `${relationships.length} relationships, ${diagrams.length} diagrams, ` +
        `${baselines.length} baselines`,
    );

    return {
      ok: true,
      data: {
        manifest,
        elements,
        relationships,
        diagrams,
        layouts: safeLayouts,
        workspace: safeWorkspace,
        importHistory,
        versionHistory,
        baselines,
      },
      warnings: manifestCheck.warnings,
    };
  } catch (err) {
    console.error('[Import] Parse failed:', err);
    return {
      ok: false,
      error:
        'Failed to parse .eapkg repository package. ' +
        (err instanceof Error ? err.message : 'Unknown error.'),
    };
  }
};

export const encodeRepositoryPackageBytes = async (
  data: RepositoryPackageData,
): Promise<Uint8Array> => {
  const elements = jsonToBytes(data.elements);
  const relationships = jsonToBytes(data.relationships);
  const diagrams = jsonToBytes(data.diagrams);
  const layouts = jsonToBytes(data.layouts);
  const workspace = jsonToBytes(data.workspace);
  const importHistory = jsonToBytes(data.importHistory);
  const versionHistory = jsonToBytes(data.versionHistory);
  const baselines = jsonToBytes(data.baselines ?? []);

  const checksum = await sha256Hex(
    concatBytes([
      elements,
      relationships,
      diagrams,
      layouts,
      workspace,
      importHistory,
      versionHistory,
      baselines,
    ]),
  );

  const manifest: RepositoryPackageManifest = {
    ...data.manifest,
    checksum,
  };

  const opt = { level: 6 as const };
  return zipSync({
    model: {
      'elements.json': [elements, opt],
      'relationships.json': [relationships, opt],
    },
    views: {
      'diagrams.json': [diagrams, opt],
      'layouts.json': [layouts, opt],
    },
    metadata: {
      'workspace.json': [workspace, opt],
      'import-history.json': [importHistory, opt],
      'version-history.json': [versionHistory, opt],
      'baselines.json': [baselines, opt],
    },
    'manifest.json': [jsonToBytes(manifest), opt],
  });
};
