// ─── CSV Import Types (Frontend) ──────────────────────────────────────────

export type DuplicateStrategy = 'CREATE_NEW' | 'UPDATE_EXISTING' | 'SKIP';

export type ImportStatus =
  | 'PENDING'
  | 'VALIDATING'
  | 'AWAITING_REVIEW'
  | 'IMPORTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type ImportRecordStatus = 'VALID' | 'INVALID' | 'DUPLICATE' | 'SKIPPED';

export type ColumnMapping = {
  csvHeader: string;
  targetField: string;
  required: boolean;
};

export type TargetField = {
  key: string;
  label: string;
  required: boolean;
};

export type FieldValidationError = {
  row: number;
  field: string;
  value: string;
  message: string;
};

export type ImportRecord = {
  rowIndex: number;
  status: ImportRecordStatus;
  data: Record<string, string>;
  mapped: Record<string, unknown>;
  errors: FieldValidationError[];
  duplicateOf?: string;
  duplicateStrategy?: DuplicateStrategy;
};

export type CsvParseResponse = {
  headers: string[];
  preview: Record<string, string>[];
  totalRows: number;
  parseErrors: string[];
};

export type MappingSuggestionResponse = {
  mappings: ColumnMapping[];
  targetFields: TargetField[];
};

export type ValidationResponse = {
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  totalProcessed: number;
  validRecords: ImportRecord[];
  invalidRecords: ImportRecord[];
  duplicateRecords: ImportRecord[];
  duplicateMatches: DuplicateMatch[];
};

export type DuplicateMatch = {
  importRowIndex: number;
  existingElementId: string;
  existingElementName: string;
  matchedBy: 'name' | 'applicationCode';
  strategy: DuplicateStrategy;
};

export type ImportBatch = {
  id: string;
  status: ImportStatus;
  fileName: string;
  userId: string;
  totalRecords: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  createdAt: string;
  completedAt?: string;
  errorReport?: FieldValidationError[];
};

/** Steps in the import wizard. */
export type ImportStep =
  | 'upload'
  | 'mapping'
  | 'validation'
  | 'duplicates'
  | 'summary';

export const IMPORT_STEPS: { key: ImportStep; title: string }[] = [
  { key: 'upload', title: 'Upload CSV' },
  { key: 'mapping', title: 'Column Mapping' },
  { key: 'validation', title: 'Validation' },
  { key: 'duplicates', title: 'Duplicates' },
  { key: 'summary', title: 'Import Summary' },
];
