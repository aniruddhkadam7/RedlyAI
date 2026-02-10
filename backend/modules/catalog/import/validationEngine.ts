// ─── Validation Engine ─────────────────────────────────────────────────────
// Validates mapped import records against business rules and constraints.
// Partial failure tolerant — invalid records are flagged but don't block others.

import type {
  FieldValidationError,
  ImportRecord,
  ValidationResult,
} from './import.types';

// ─── Allowed Enum Values ──────────────────────────────────────────────────

const VALID_LIFECYCLE_VALUES = new Set([
  'Planned',
  'Active',
  'Deprecated',
  'Retired',
]);

const VALID_APPLICATION_TYPES = new Set(['COTS', 'Custom', 'SaaS', 'Legacy']);

const VALID_CRITICALITY_VALUES = new Set([
  'Mission-Critical',
  'High',
  'Medium',
  'Low',
]);

const VALID_DEPLOYMENT_MODELS = new Set(['On-Prem', 'Cloud', 'Hybrid']);

const VALID_RISK_LEVELS = new Set(['High', 'Medium', 'Low']);

// ─── Field Constraints ────────────────────────────────────────────────────

const MAX_NAME_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_GENERIC_LENGTH = 255;

/** Characters that are forbidden in element names. */
const INVALID_NAME_CHARS = /[<>{}|\\^~[\]`]/;

// ─── Validators ───────────────────────────────────────────────────────────

type FieldValidator = (
  value: string,
  rowIndex: number,
) => FieldValidationError | null;

const requiredString =
  (field: string, label: string): FieldValidator =>
  (value, rowIndex) => {
    if (!value || value.trim().length === 0) {
      return { row: rowIndex, field, value, message: `${label} is required.` };
    }
    return null;
  };

const maxLength =
  (field: string, label: string, max: number): FieldValidator =>
  (value, rowIndex) => {
    if (value && value.length > max) {
      return {
        row: rowIndex,
        field,
        value: `${value.slice(0, 40)}…`,
        message: `${label} exceeds maximum length of ${max} characters.`,
      };
    }
    return null;
  };

const noInvalidChars =
  (field: string, label: string): FieldValidator =>
  (value, rowIndex) => {
    if (value && INVALID_NAME_CHARS.test(value)) {
      return {
        row: rowIndex,
        field,
        value,
        message: `${label} contains invalid characters.`,
      };
    }
    return null;
  };

const enumValue =
  (
    field: string,
    label: string,
    allowed: Set<string>,
    caseInsensitive = true,
  ): FieldValidator =>
  (value, rowIndex) => {
    if (!value || value.trim().length === 0) return null; // Optional fields can be blank.
    const lookup = caseInsensitive
      ? [...allowed].find((v) => v.toLowerCase() === value.toLowerCase())
      : allowed.has(value)
        ? value
        : undefined;
    if (!lookup) {
      return {
        row: rowIndex,
        field,
        value,
        message: `${label} must be one of: ${[...allowed].join(', ')}.`,
      };
    }
    return null;
  };

const numericValue =
  (field: string, label: string): FieldValidator =>
  (value, rowIndex) => {
    if (!value || value.trim().length === 0) return null;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      return {
        row: rowIndex,
        field,
        value,
        message: `${label} must be a non-negative number.`,
      };
    }
    return null;
  };

/**
 * Normalize enum values to canonical casing.
 */
function normalizeEnumValue(value: string, allowed: Set<string>): string {
  if (!value) return '';
  const match = [...allowed].find(
    (v) => v.toLowerCase() === value.toLowerCase(),
  );
  return match ?? value;
}

/**
 * Normalize a mapped record's enum fields to proper casing.
 */
function normalizeMappedRecord(
  mapped: Record<string, string>,
): Record<string, unknown> {
  const result = { ...mapped } as Record<string, unknown>;

  if (mapped.lifecycleStatus) {
    result.lifecycleStatus = normalizeEnumValue(
      mapped.lifecycleStatus,
      VALID_LIFECYCLE_VALUES,
    );
  }
  if (mapped.applicationType) {
    result.applicationType = normalizeEnumValue(
      mapped.applicationType,
      VALID_APPLICATION_TYPES,
    );
  }
  if (mapped.businessCriticality) {
    result.businessCriticality = normalizeEnumValue(
      mapped.businessCriticality,
      VALID_CRITICALITY_VALUES,
    );
  }
  if (mapped.deploymentModel) {
    result.deploymentModel = normalizeEnumValue(
      mapped.deploymentModel,
      VALID_DEPLOYMENT_MODELS,
    );
  }
  if (mapped.vendorLockInRisk) {
    result.vendorLockInRisk = normalizeEnumValue(
      mapped.vendorLockInRisk,
      VALID_RISK_LEVELS,
    );
  }
  if (mapped.technicalDebtLevel) {
    result.technicalDebtLevel = normalizeEnumValue(
      mapped.technicalDebtLevel,
      VALID_RISK_LEVELS,
    );
  }
  if (mapped.annualRunCost) {
    const num = Number(mapped.annualRunCost);
    result.annualRunCost = Number.isFinite(num) ? num : 0;
  }
  if (mapped.availabilityTarget) {
    const num = Number(mapped.availabilityTarget);
    result.availabilityTarget = Number.isFinite(num) ? num : 99.9;
  }

  return result;
}

/**
 * Validate a single mapped record.
 */
export function validateRecord(
  mapped: Record<string, string>,
  rowIndex: number,
): { errors: FieldValidationError[]; normalized: Record<string, unknown> } {
  const errors: FieldValidationError[] = [];

  // Simpler approach: run each validator explicitly by field.
  const fieldValidators: Record<string, FieldValidator[]> = {
    name: [
      requiredString('name', 'Name'),
      maxLength('name', 'Name', MAX_NAME_LENGTH),
      noInvalidChars('name', 'Name'),
    ],
    description: [
      maxLength('description', 'Description', MAX_DESCRIPTION_LENGTH),
    ],
    applicationCode: [
      maxLength('applicationCode', 'Application Code', MAX_GENERIC_LENGTH),
    ],
    applicationType: [
      enumValue('applicationType', 'Application Type', VALID_APPLICATION_TYPES),
    ],
    lifecycleStatus: [
      enumValue('lifecycleStatus', 'Lifecycle Status', VALID_LIFECYCLE_VALUES),
    ],
    ownerName: [maxLength('ownerName', 'Owner', MAX_GENERIC_LENGTH)],
    ownerRole: [maxLength('ownerRole', 'Owner Role', MAX_GENERIC_LENGTH)],
    owningUnit: [maxLength('owningUnit', 'Owning Unit', MAX_GENERIC_LENGTH)],
    businessCriticality: [
      enumValue(
        'businessCriticality',
        'Business Criticality',
        VALID_CRITICALITY_VALUES,
      ),
    ],
    deploymentModel: [
      enumValue('deploymentModel', 'Deployment Model', VALID_DEPLOYMENT_MODELS),
    ],
    vendorName: [maxLength('vendorName', 'Vendor Name', MAX_GENERIC_LENGTH)],
    annualRunCost: [numericValue('annualRunCost', 'Annual Run Cost')],
    availabilityTarget: [
      numericValue('availabilityTarget', 'Availability Target'),
    ],
    vendorLockInRisk: [
      enumValue('vendorLockInRisk', 'Vendor Lock-In Risk', VALID_RISK_LEVELS),
    ],
    technicalDebtLevel: [
      enumValue(
        'technicalDebtLevel',
        'Technical Debt Level',
        VALID_RISK_LEVELS,
      ),
    ],
  };

  for (const [field, validators] of Object.entries(fieldValidators)) {
    const value = mapped[field] ?? '';
    for (const validate of validators) {
      const error = validate(value, rowIndex);
      if (error) errors.push(error);
    }
  }

  const normalized = normalizeMappedRecord(mapped);
  return { errors, normalized };
}

/**
 * Validate a batch of import records.
 */
export function validateBatch(records: ImportRecord[]): ValidationResult {
  const validRecords: ImportRecord[] = [];
  const invalidRecords: ImportRecord[] = [];
  const duplicateRecords: ImportRecord[] = [];

  for (const record of records) {
    const { errors, normalized } = validateRecord(
      record.mapped as Record<string, string>,
      record.rowIndex,
    );

    record.errors = errors;
    record.mapped = normalized;

    if (record.status === 'DUPLICATE') {
      duplicateRecords.push(record);
    } else if (errors.length > 0) {
      record.status = 'INVALID';
      invalidRecords.push(record);
    } else {
      record.status = 'VALID';
      validRecords.push(record);
    }
  }

  return {
    validRecords,
    invalidRecords,
    duplicateRecords,
    totalProcessed: records.length,
  };
}
