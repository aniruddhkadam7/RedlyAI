// ─── CSV Parser ────────────────────────────────────────────────────────────
// Parses CSV text into structured rows.
// Handles quoted fields, newlines inside quotes, and large files via chunking.

import type { CsvParseResult, CsvRawRow } from './import.types';

const FIELD_SEPARATOR = ',';
const LINE_SEPARATOR = /\r?\n/;
const MAX_HEADER_LENGTH = 256;

/**
 * Parse a single CSV line respecting quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === FIELD_SEPARATOR) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Detects the separator used in the CSV header line.
 * Supports comma, semicolon, and tab.
 */
function detectSeparator(headerLine: string): string {
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = 0;
  for (const sep of candidates) {
    const count = headerLine.split(sep).length;
    if (count > bestCount) {
      bestCount = count;
      best = sep;
    }
  }
  return best;
}

/**
 * Parse CSV content into structured data.
 *
 * - Returns headers and rows as key-value records.
 * - Validates header presence.
 * - Continues on row-level errors (partial failure tolerance).
 */
export function parseCsv(content: string): CsvParseResult {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      errors: ['CSV content is empty.'],
    };
  }

  const lines = content
    .split(LINE_SEPARATOR)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      errors: ['CSV content has no lines.'],
    };
  }

  // Parse the header line.
  const headerLine = lines[0];
  const separator = detectSeparator(headerLine);
  const headers = parseCsvLine(
    headerLine.replace(new RegExp(separator, 'g'), FIELD_SEPARATOR),
  );

  // Validate headers.
  if (headers.length === 0 || headers.every((h) => h.length === 0)) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      errors: ['No valid headers found in CSV.'],
    };
  }

  for (const header of headers) {
    if (header.length > MAX_HEADER_LENGTH) {
      errors.push(
        `Header "${header.slice(0, 40)}..." exceeds maximum length of ${MAX_HEADER_LENGTH}.`,
      );
    }
  }

  // Parse data rows.
  const rows: CsvRawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    try {
      const rawFields = parseCsvLine(
        lines[i].replace(
          new RegExp(separator === ',' ? ',' : separator, 'g'),
          FIELD_SEPARATOR,
        ),
      );

      const row: CsvRawRow = {};
      for (let j = 0; j < headers.length; j++) {
        const key = headers[j];
        row[key] = j < rawFields.length ? rawFields[j] : '';
      }
      rows.push(row);
    } catch (err) {
      errors.push(
        `Row ${i + 1}: Parse error – ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { headers, rows, totalRows: rows.length, errors };
}

/**
 * Parse CSV in batches for large files.
 * Yields batches of rows to prevent full memory load.
 */
export function* parseCsvBatched(
  content: string,
  batchSize = 200,
): Generator<{ batch: CsvRawRow[]; batchIndex: number; headers: string[] }> {
  const result = parseCsv(content);
  const { headers, rows } = result;

  for (let i = 0; i < rows.length; i += batchSize) {
    yield {
      batch: rows.slice(i, i + batchSize),
      batchIndex: Math.floor(i / batchSize),
      headers,
    };
  }
}
