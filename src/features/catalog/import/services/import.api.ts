// ─── Import API Service ───────────────────────────────────────────────────
// Frontend API client for the CSV import feature.

import { request } from '@umijs/max';
import type {
  ColumnMapping,
  CsvParseResponse,
  DuplicateStrategy,
  ImportBatch,
  ImportRecord,
  MappingSuggestionResponse,
  ValidationResponse,
} from '../types/import.types';

type ApiResponse<T> = {
  success: boolean;
  data: T;
  errorMessage?: string;
  pagination?: { total: number; page: number; pageSize: number };
};

/**
 * Upload and parse CSV content.
 */
export const parseCsvContent = async (content: string) =>
  request<ApiResponse<CsvParseResponse>>('/api/catalog/import/parse', {
    method: 'POST',
    data: { content },
  });

/**
 * Get auto-detected column mapping suggestions.
 */
export const suggestMappings = async (headers: string[]) =>
  request<ApiResponse<MappingSuggestionResponse>>(
    '/api/catalog/import/mappings',
    {
      method: 'POST',
      data: { headers },
    },
  );

/**
 * Validate data and detect duplicates.
 * Sends full CSV content for server-side re-parsing when available.
 */
export const validateImportData = async (
  mappings: ColumnMapping[],
  duplicateStrategy?: DuplicateStrategy,
  csvContent?: string,
  rows?: Record<string, string>[],
) =>
  request<ApiResponse<ValidationResponse>>('/api/catalog/import/validate', {
    method: 'POST',
    data: { mappings, duplicateStrategy, csvContent, rows },
    timeout: 30000,
  });

/**
 * Execute the final import.
 */
export const executeImport = async (args: {
  validRecords: ImportRecord[];
  duplicateRecords: ImportRecord[];
  fileName: string;
  userId?: string;
}) =>
  request<ApiResponse<ImportBatch>>('/api/catalog/import/execute', {
    method: 'POST',
    data: args,
    timeout: 30000,
  });

/**
 * Get import history with pagination.
 */
export const fetchImportHistory = async (page = 1, pageSize = 20) =>
  request<ApiResponse<ImportBatch[]>>('/api/catalog/import/history', {
    method: 'GET',
    params: { page, pageSize },
  });

/**
 * Get a single import batch record.
 */
export const fetchImportBatch = async (batchId: string) =>
  request<ApiResponse<ImportBatch>>(
    `/api/catalog/import/history/${encodeURIComponent(batchId)}`,
    {
      method: 'GET',
    },
  );

/**
 * Get existing application element for duplicate preview.
 */
export const fetchExistingElement = async (elementId: string) =>
  request<ApiResponse<Record<string, unknown>>>(
    `/api/catalog/import/element/${encodeURIComponent(elementId)}`,
    {
      method: 'GET',
    },
  );
