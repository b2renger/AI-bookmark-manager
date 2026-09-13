// RFC 4180 with the pragmatic extensions every real export needs: BOM, CRLF or LF, `;` and tab
// delimiters, ragged rows. Pure string in, plain rows out.

export type CsvDelimiter = ',' | ';' | '\t' | '|';

export interface ParseCsvOptions {
  delimiter?: CsvDelimiter | 'auto';
  /** Treat the first record as headers. Default true. */
  header?: boolean;
  /** Drop records whose cells are all empty. Default true. */
  skipEmptyLines?: boolean;
}

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
}

const CANDIDATES: CsvDelimiter[] = [',', ';', '\t', '|'];

/** Counts delimiters outside quotes on the first few lines; the most consistent one wins. */
export function detectDelimiter(text: string): CsvDelimiter {
  const sample = text.slice(0, 64_000);
  let best: CsvDelimiter = ',';
  let bestScore = -1;
  for (const d of CANDIDATES) {
    const counts = countPerRecord(sample, d, 5);
    if (counts.length === 0) continue;
    const first = counts[0] ?? 0;
    if (first === 0) continue;
    const consistent = counts.every((c) => c === first);
    const score = first * (consistent ? 10 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function countPerRecord(text: string, delimiter: string, maxRecords: number): number[] {
  const out: number[] = [];
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') i++;
        else inQuotes = false;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) count++;
    else if (ch === '\n') {
      out.push(count);
      count = 0;
      if (out.length >= maxRecords) return out;
    }
  }
  if (count > 0 || out.length === 0) out.push(count);
  return out;
}

/** Splits into records of raw cells. Exported for the JSON-less callers (sniffers). */
export function parseCsvRecords(text: string, delimiter: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // BOM
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let started = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      started = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
      started = true;
    } else if (ch === '\r') {
      // swallow; the \n that follows ends the record (a lone \r ends it too)
      if (src[i + 1] !== '\n') {
        row.push(field);
        records.push(row);
        row = [];
        field = '';
        started = false;
      }
    } else if (ch === '\n') {
      row.push(field);
      records.push(row);
      row = [];
      field = '';
      started = false;
    } else {
      field += ch;
      started = true;
    }
  }
  if (started || field !== '' || row.length > 0) {
    row.push(field);
    records.push(row);
  }
  return records;
}

export function parseCsv(text: string, opts?: ParseCsvOptions): ParsedCsv {
  const wanted = opts?.delimiter ?? 'auto';
  const stripped = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delimiter = wanted === 'auto' ? detectDelimiter(stripped) : wanted;
  const records = parseCsvRecords(stripped, delimiter);
  const skipEmpty = opts?.skipEmptyLines !== false;

  const useHeader = opts?.header !== false;
  let headers: string[];
  let body: string[][];
  if (useHeader) {
    headers = (records[0] ?? []).map((h, i) => h.trim() || `column_${i + 1}`);
    body = records.slice(1);
  } else {
    const width = records.reduce((m, r) => Math.max(m, r.length), 0);
    headers = Array.from({ length: width }, (_, i) => `column_${i + 1}`);
    body = records;
  }

  const rows: Record<string, string>[] = [];
  for (const rec of body) {
    if (skipEmpty && rec.every((c) => c.trim() === '')) continue;
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) row[headers[i]!] = rec[i] ?? '';
    // Ragged overflow is kept so nothing is silently lost.
    for (let i = headers.length; i < rec.length; i++) row[`column_${i + 1}`] = rec[i]!;
    rows.push(row);
  }
  return { headers, rows, delimiter };
}
