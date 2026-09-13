import type { ExportHeader, ExportRecord, ExportSink } from './types.js';

// JSONL: one record per line, header first. This is the lossless format — the round-trip contract
// `import(export(db)) ≍ db` is tested against it (plans/TECHNICAL-DESIGN.md §4.3).

export interface WriteJsonlResult {
  items: number;
  bytes: number;
}

/** Streams records to the sink, one JSON object per line. Never concatenates the whole export. */
export async function writeJsonl(
  records: Iterable<ExportRecord> | AsyncIterable<ExportRecord>,
  sink: ExportSink,
): Promise<WriteJsonlResult> {
  let items = 0;
  let bytes = 0;
  const emit = async (record: ExportRecord): Promise<void> => {
    const line = `${JSON.stringify(record)}\n`;
    bytes += line.length;
    items++;
    await sink.write(line);
  };

  if (isAsyncIterable(records)) {
    for await (const record of records) await emit(record);
  } else {
    for (const record of records) await emit(record);
  }
  await sink.close();
  return { items, bytes };
}

function isAsyncIterable(v: unknown): v is AsyncIterable<ExportRecord> {
  return typeof (v as AsyncIterable<ExportRecord>)[Symbol.asyncIterator] === 'function';
}

export interface ParsedJsonl {
  header: ExportHeader | null;
  records: ExportRecord[];
  errors: { line: number; raw: string; reason: string }[];
}

/** Tolerant reader: one bad line is reported, not thrown — a truncated export still restores. */
export function parseJsonl(text: string): ParsedJsonl {
  const out: ParsedJsonl = { header: null, records: [], errors: [] };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (e) {
      out.errors.push({
        line: i + 1,
        raw: line.slice(0, 200),
        reason: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    if (typeof value !== 'object' || value === null) {
      out.errors.push({ line: i + 1, raw: line.slice(0, 200), reason: 'not an object' });
      continue;
    }
    const record = value as Record<string, unknown>;
    // The header may be written with or without an explicit `t` (the design's sample omits it).
    if (record['t'] === 'header' || (out.header === null && typeof record['$schema'] === 'string')) {
      out.header = { ...(record as unknown as ExportHeader), t: 'header' };
      continue;
    }
    if (typeof record['t'] !== 'string') {
      out.errors.push({ line: i + 1, raw: line.slice(0, 200), reason: 'record without a `t` tag' });
      continue;
    }
    out.records.push(record as unknown as ExportRecord);
  }
  return out;
}
