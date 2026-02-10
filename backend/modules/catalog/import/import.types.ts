// ─── CSV Import Types ──────────────────────────────────────────────────────

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

/** A single column mapping from the CSV header to an architecture attribute. */
export type ColumnMapping = {
  csvHeader: string;
  targetField: string;
  required: boolean;
};

/** Target fields for application import. */
export const APPLICATION_IMPORT_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'description', label: 'Description', required: false },
  { key: 'applicationCode', label: 'Application Code', required: false },
  { key: 'applicationType', label: 'Application Type', required: false },
  { key: 'lifecycleStatus', label: 'Lifecycle Status', required: false },
  { key: 'ownerName', label: 'Owner', required: false },
  { key: 'ownerRole', label: 'Owner Role', required: false },
  { key: 'owningUnit', label: 'Owning Unit', required: false },
  {
    key: 'businessCriticality',
    label: 'Business Criticality',
    required: false,
  },
  { key: 'deploymentModel', label: 'Deployment Model', required: false },
  { key: 'vendorName', label: 'Vendor Name', required: false },
  { key: 'annualRunCost', label: 'Annual Run Cost', required: false },
  { key: 'availabilityTarget', label: 'Availability Target', required: false },
  { key: 'vendorLockInRisk', label: 'Vendor Lock-In Risk', required: false },
  { key: 'technicalDebtLevel', label: 'Technical Debt Level', required: false },
] as const;

export type ApplicationImportFieldKey =
  (typeof APPLICATION_IMPORT_FIELDS)[number]['key'];

/** A raw parsed row from the CSV file. */
export type CsvRawRow = Record<string, string>;

/** Validation error for a single field. */
export type FieldValidationError = {
  row: number;
  field: string;
  value: string;
  message: string;
};

/** A validated import record. */
export type ImportRecord = {
  rowIndex: number;
  status: ImportRecordStatus;
  data: Record<string, string>;
  mapped: Record<string, unknown>;
  errors: FieldValidationError[];
  duplicateOf?: string;
  duplicateStrategy?: DuplicateStrategy;
};

/** The result of parsing a CSV file. */
export type CsvParseResult = {
  headers: string[];
  rows: CsvRawRow[];
  totalRows: number;
  errors: string[];
};

/** The result of validation. */
export type ValidationResult = {
  validRecords: ImportRecord[];
  invalidRecords: ImportRecord[];
  duplicateRecords: ImportRecord[];
  totalProcessed: number;
};

/** Import batch metadata. */
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

/** Import progress event payload. */
export type ImportProgress = {
  batchId: string;
  processed: number;
  total: number;
  status: ImportStatus;
};
