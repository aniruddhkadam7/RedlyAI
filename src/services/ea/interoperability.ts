import { request } from 'umi';

import type {
  CsvExportEngineResult,
  CsvImportEngineResult,
  CsvImportSourceEntity,
} from '../../../backend/interoperability';
import type { ExportScope } from '../../../backend/interoperability/ExportScope';

export type InteroperabilityApiResponse<T> = {
  success: boolean;
  data: T;
  errorMessage?: string;
};

export type CsvImportRequest = {
  entity: CsvImportSourceEntity;
  csvText: string;
  sourceDescription?: string;
};

export async function validateCsvImport(body: CsvImportRequest, options?: Record<string, any>) {
  return request<InteroperabilityApiResponse<CsvImportEngineResult>>('/api/interoperability/import/csv/validate', {
    method: 'POST',
    data: body,
    ...(options || {}),
  });
}

export async function executeCsvImport(body: CsvImportRequest, options?: Record<string, any>) {
  return request<InteroperabilityApiResponse<CsvImportEngineResult>>('/api/interoperability/import/csv/execute', {
    method: 'POST',
    data: body,
    ...(options || {}),
  });
}

export async function exportCsv(scope: ExportScope, options?: Record<string, any>) {
  return request<InteroperabilityApiResponse<CsvExportEngineResult>>('/api/interoperability/export/csv', {
    method: 'POST',
    data: { scope },
    ...(options || {}),
  });
}
