// ─── CSV Import Tests ─────────────────────────────────────────────────────

import {
  parseCsv,
  parseCsvBatched,
} from '../backend/modules/catalog/import/csvParser';
import type { ImportRecord } from '../backend/modules/catalog/import/import.types';
import {
  applyMappings,
  autoDetectMappings,
  validateMappings,
} from '../backend/modules/catalog/import/mappingEngine';
import {
  validateBatch,
  validateRecord,
} from '../backend/modules/catalog/import/validationEngine';

// ─── CSV Parser Tests ─────────────────────────────────────────────────────

describe('csvParser', () => {
  it('parses a simple CSV with headers and data rows', () => {
    const csv = `name,type,lifecycle
App1,COTS,Active
App2,SaaS,Planned`;

    const result = parseCsv(csv);
    expect(result.headers).toEqual(['name', 'type', 'lifecycle']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].name).toBe('App1');
    expect(result.rows[1].lifecycle).toBe('Planned');
    expect(result.totalRows).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('handles empty CSV content', () => {
    const result = parseCsv('');
    expect(result.headers).toEqual([]);
    expect(result.rows).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('handles CSV with only headers', () => {
    const csv = 'name,type,lifecycle';
    const result = parseCsv(csv);
    expect(result.headers).toEqual(['name', 'type', 'lifecycle']);
    expect(result.rows).toHaveLength(0);
    expect(result.totalRows).toBe(0);
  });

  it('handles quoted fields with commas', () => {
    const csv = `name,description
"App, Inc.","A ""quoted"" value"`;

    const result = parseCsv(csv);
    expect(result.rows[0].name).toBe('App, Inc.');
    expect(result.rows[0].description).toBe('A "quoted" value');
  });

  it('handles missing values in rows', () => {
    const csv = `name,type,lifecycle
App1,,Active
App2,SaaS,`;

    const result = parseCsv(csv);
    expect(result.rows[0].type).toBe('');
    expect(result.rows[1].lifecycle).toBe('');
  });

  it('handles semicolon-separated CSV', () => {
    const csv = `name;type;lifecycle
App1;COTS;Active`;

    const result = parseCsv(csv);
    expect(result.headers).toEqual(['name', 'type', 'lifecycle']);
    expect(result.rows[0].name).toBe('App1');
  });

  it('parses in batches', () => {
    const lines = ['name,type'];
    for (let i = 0; i < 500; i++) {
      lines.push(`App${i},COTS`);
    }
    const csv = lines.join('\n');

    const batches = [...parseCsvBatched(csv, 200)];
    expect(batches.length).toBe(3);
    expect(batches[0].batch.length).toBe(200);
    expect(batches[1].batch.length).toBe(200);
    expect(batches[2].batch.length).toBe(100);
  });
});

// ─── Mapping Engine Tests ─────────────────────────────────────────────────

describe('mappingEngine', () => {
  it('auto-detects common column names', () => {
    const headers = [
      'Name',
      'Application Type',
      'Lifecycle Status',
      'Owner',
      'Criticality',
    ];
    const mappings = autoDetectMappings(headers);

    expect(mappings.find((m) => m.csvHeader === 'Name')?.targetField).toBe(
      'name',
    );
    expect(
      mappings.find((m) => m.csvHeader === 'Application Type')?.targetField,
    ).toBe('applicationType');
    expect(
      mappings.find((m) => m.csvHeader === 'Lifecycle Status')?.targetField,
    ).toBe('lifecycleStatus');
    expect(mappings.find((m) => m.csvHeader === 'Owner')?.targetField).toBe(
      'ownerName',
    );
    expect(
      mappings.find((m) => m.csvHeader === 'Criticality')?.targetField,
    ).toBe('businessCriticality');
  });

  it('handles unrecognized headers', () => {
    const headers = ['foo_bar', 'random_column'];
    const mappings = autoDetectMappings(headers);

    expect(mappings[0].targetField).toBe('');
    expect(mappings[1].targetField).toBe('');
  });

  it('validates required mappings', () => {
    const mappings = [
      { csvHeader: 'col1', targetField: 'name', required: true },
    ];
    const result = validateMappings(mappings);
    expect(result.valid).toBe(true);
    expect(result.missingRequired).toHaveLength(0);
  });

  it('rejects when required mapping is missing', () => {
    const mappings = [
      { csvHeader: 'col1', targetField: 'description', required: false },
    ];
    const result = validateMappings(mappings);
    expect(result.valid).toBe(false);
    expect(result.missingRequired).toContain('name');
  });

  it('applies mappings to a row', () => {
    const row = { 'App Name': 'TestApp', Status: 'Active' };
    const mappings = [
      { csvHeader: 'App Name', targetField: 'name', required: true },
      { csvHeader: 'Status', targetField: 'lifecycleStatus', required: false },
    ];

    const result = applyMappings(row, mappings);
    expect(result.name).toBe('TestApp');
    expect(result.lifecycleStatus).toBe('Active');
  });
});

// ─── Validation Engine Tests ──────────────────────────────────────────────

describe('validationEngine', () => {
  it('validates a valid record', () => {
    const mapped = {
      name: 'Test Application',
      applicationType: 'COTS',
      lifecycleStatus: 'Active',
      businessCriticality: 'High',
    };

    const result = validateRecord(mapped, 1);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects record with missing required name', () => {
    const mapped = {
      name: '',
      applicationType: 'COTS',
    };

    const result = validateRecord(mapped, 1);
    expect(result.errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('rejects record with invalid enum value', () => {
    const mapped = {
      name: 'Test App',
      lifecycleStatus: 'InvalidStatus',
    };

    const result = validateRecord(mapped, 1);
    expect(result.errors.some((e) => e.field === 'lifecycleStatus')).toBe(true);
  });

  it('normalizes enum values case-insensitively', () => {
    const mapped = {
      name: 'Test App',
      lifecycleStatus: 'active',
      businessCriticality: 'high',
    };

    const result = validateRecord(mapped, 1);
    expect(result.errors).toHaveLength(0);
    expect(result.normalized.lifecycleStatus).toBe('Active');
    expect(result.normalized.businessCriticality).toBe('High');
  });

  it('rejects record with invalid characters in name', () => {
    const mapped = {
      name: 'App<script>',
    };

    const result = validateRecord(mapped, 1);
    expect(result.errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('rejects record with non-numeric cost', () => {
    const mapped = {
      name: 'Test App',
      annualRunCost: 'not-a-number',
    };

    const result = validateRecord(mapped, 1);
    expect(result.errors.some((e) => e.field === 'annualRunCost')).toBe(true);
  });

  it('validates a batch with mixed valid/invalid records', () => {
    const records: ImportRecord[] = [
      {
        rowIndex: 1,
        status: 'VALID',
        data: {},
        mapped: { name: 'Valid App' },
        errors: [],
      },
      {
        rowIndex: 2,
        status: 'VALID',
        data: {},
        mapped: { name: '' },
        errors: [],
      },
      {
        rowIndex: 3,
        status: 'VALID',
        data: {},
        mapped: { name: 'Another App', lifecycleStatus: 'BadValue' },
        errors: [],
      },
    ];

    const result = validateBatch(records);
    expect(result.validRecords).toHaveLength(1);
    expect(result.invalidRecords).toHaveLength(2);
    expect(result.totalProcessed).toBe(3);
  });

  it('allows optional fields to be empty', () => {
    const mapped = {
      name: 'Test App',
      description: '',
      ownerName: '',
      vendorName: '',
    };

    const result = validateRecord(mapped, 1);
    expect(result.errors).toHaveLength(0);
  });
});
