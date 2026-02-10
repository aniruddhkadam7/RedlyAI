// ─── Column Mapping Engine ─────────────────────────────────────────────────
// Maps CSV headers → Application meta-model attributes.
// Provides auto-detection, manual override, and validation.

import {
  APPLICATION_IMPORT_FIELDS,
  type ApplicationImportFieldKey,
  type ColumnMapping,
  type CsvRawRow,
} from './import.types';

/** Normalized alias index for auto-detection. */
const FIELD_ALIASES: Record<string, ApplicationImportFieldKey> = {
  name: 'name',
  'application name': 'name',
  'app name': 'name',
  title: 'name',
  application: 'name',

  description: 'description',
  desc: 'description',
  details: 'description',

  'application code': 'applicationCode',
  'app code': 'applicationCode',
  code: 'applicationCode',
  'app id': 'applicationCode',
  applicationcode: 'applicationCode',

  type: 'applicationType',
  'application type': 'applicationType',
  'app type': 'applicationType',
  applicationtype: 'applicationType',

  lifecycle: 'lifecycleStatus',
  'lifecycle status': 'lifecycleStatus',
  lifecyclestatus: 'lifecycleStatus',
  status: 'lifecycleStatus',

  owner: 'ownerName',
  'owner name': 'ownerName',
  ownername: 'ownerName',

  'owner role': 'ownerRole',
  ownerrole: 'ownerRole',
  role: 'ownerRole',

  'owning unit': 'owningUnit',
  owningunit: 'owningUnit',
  department: 'owningUnit',
  unit: 'owningUnit',

  criticality: 'businessCriticality',
  'business criticality': 'businessCriticality',
  businesscriticality: 'businessCriticality',

  'deployment model': 'deploymentModel',
  deploymentmodel: 'deploymentModel',
  deployment: 'deploymentModel',

  vendor: 'vendorName',
  'vendor name': 'vendorName',
  vendorname: 'vendorName',

  cost: 'annualRunCost',
  'annual run cost': 'annualRunCost',
  annualruncost: 'annualRunCost',
  'annual cost': 'annualRunCost',

  availability: 'availabilityTarget',
  'availability target': 'availabilityTarget',
  availabilitytarget: 'availabilityTarget',

  'vendor lock-in risk': 'vendorLockInRisk',
  vendorlockinrisk: 'vendorLockInRisk',
  'lock-in risk': 'vendorLockInRisk',

  'technical debt': 'technicalDebtLevel',
  technicaldebtlevel: 'technicalDebtLevel',
  'tech debt': 'technicalDebtLevel',
};

/**
 * Suggest auto-mappings from CSV headers to target fields.
 */
export function autoDetectMappings(csvHeaders: string[]): ColumnMapping[] {
  const usedTargets = new Set<string>();

  return csvHeaders.map((header) => {
    const normalized = header.trim().toLowerCase().replace(/[_-]+/g, ' ');
    const match = FIELD_ALIASES[normalized];

    if (match && !usedTargets.has(match)) {
      usedTargets.add(match);
      const fieldDef = APPLICATION_IMPORT_FIELDS.find((f) => f.key === match);
      return {
        csvHeader: header,
        targetField: match,
        required: fieldDef?.required ?? false,
      };
    }

    return {
      csvHeader: header,
      targetField: '',
      required: false,
    };
  });
}

/**
 * Validate that all required fields are mapped.
 */
export function validateMappings(mappings: ColumnMapping[]): {
  valid: boolean;
  missingRequired: string[];
} {
  const requiredFields = APPLICATION_IMPORT_FIELDS.filter(
    (f) => f.required,
  ).map((f) => f.key);
  const mappedTargets = new Set(
    mappings.map((m) => m.targetField).filter(Boolean),
  );
  const missingRequired = requiredFields.filter(
    (field) => !mappedTargets.has(field),
  );

  return {
    valid: missingRequired.length === 0,
    missingRequired,
  };
}

/**
 * Apply column mappings to a raw CSV row.
 * Returns a record keyed by target field names.
 */
export function applyMappings(
  row: CsvRawRow,
  mappings: ColumnMapping[],
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const mapping of mappings) {
    if (!mapping.targetField) continue;
    const value = row[mapping.csvHeader] ?? '';
    result[mapping.targetField] = value;
  }

  return result;
}

/**
 * Get available target fields for the mapping UI.
 */
export function getAvailableTargetFields() {
  return APPLICATION_IMPORT_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    required: f.required,
  }));
}
