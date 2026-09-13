import type { ColumnMapping } from '../csv/mapping.js';
import { inferMapping, mapRowsToResult } from '../csv/mapping.js';
import { parseCsv, type CsvDelimiter } from '../csv/parse.js';
import type { ImportResult, Importer, ImportSource } from './types.js';
import { summarise, srcText } from './util.js';

// The long tail. Everything that is not a known product's export lands here, and the mapper UI
// (P0 task 12) edits the inferred ColumnMapping before commit.

const SOURCE_LABEL = 'CSV';
const SAMPLE_ROWS = 25;

export interface CsvImportOptions {
  mapping?: ColumnMapping;
  delimiter?: CsvDelimiter | 'auto';
}

export function sniffCsv(src: ImportSource): number {
  if (src.kind === 'rows' && src.rows?.length) {
    const headers = Object.keys(src.rows[0]!);
    return headers.some((h) => /url|lien|link|href/i.test(h)) ? 0.6 : 0.3;
  }
  const text = srcText(src);
  if (!text.trim() || text.trimStart().startsWith('<') || text.trimStart().startsWith('{')) return 0;
  const { headers, rows, delimiter } = parseCsv(text, { delimiter: 'auto' });
  if (headers.length < 2) return 0;
  const mapping = inferMapping(headers, rows.slice(0, SAMPLE_ROWS));
  const hasUrl = Object.values(mapping).some((m) => m.field === 'url');
  if (!hasUrl) return 0;
  const named = Object.values(mapping).filter((m) => m.field !== 'ignore').length;
  // A real delimiter plus a url column plus at least one other recognised column.
  const base = delimiter === ',' ? 0.5 : 0.55;
  return Math.min(0.75, base + Math.min(named - 1, 4) * 0.05);
}

export function parseCsvSource(src: ImportSource, opts?: CsvImportOptions): ImportResult {
  let headers: string[];
  let rows: Record<string, string>[];
  if (src.kind === 'rows' && src.rows) {
    rows = src.rows;
    headers = Object.keys(rows[0] ?? {});
  } else {
    const text = srcText(src);
    if (!text.trim()) return summarise([], [], SOURCE_LABEL);
    const parsed = parseCsv(text, { delimiter: opts?.delimiter ?? 'auto' });
    headers = parsed.headers;
    rows = parsed.rows;
  }
  const mapping = opts?.mapping ?? inferMapping(headers, rows.slice(0, SAMPLE_ROWS));
  return mapRowsToResult(rows, mapping, SOURCE_LABEL);
}

export const csvImporter: Importer = {
  id: 'csv',
  sniff: sniffCsv,
  parse: (src: ImportSource, opts?: unknown): ImportResult =>
    parseCsvSource(src, opts as CsvImportOptions | undefined),
};
