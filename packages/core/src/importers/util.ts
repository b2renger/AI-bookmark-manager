import type { BookmarkDraft, ImportResult, MalformedRow } from './types.js';

// Shared plumbing. `exactOptionalPropertyTypes` is on, so drafts are built field by field rather
// than with `{ title: maybeUndefined }`.

export interface DraftInput {
  url: string;
  title?: string | undefined;
  note?: string | undefined;
  summary?: string | undefined;
  tags?: (string | undefined)[] | undefined;
  folderPath?: (string | undefined)[] | undefined;
  createdAt?: string | undefined;
  author?: string | undefined;
  extra?: Record<string, unknown> | undefined;
}

export function makeDraft(input: DraftInput): BookmarkDraft {
  const d: BookmarkDraft = { url: input.url.trim() };
  const title = input.title?.trim();
  if (title) d.title = title;
  const note = input.note?.trim();
  if (note) d.note = note;
  const summary = input.summary?.trim();
  if (summary) d.summary = summary;
  const tags = cleanList(input.tags);
  if (tags.length) d.tags = tags;
  const folderPath = cleanList(input.folderPath, true);
  if (folderPath.length) d.folderPath = folderPath;
  if (input.createdAt) d.createdAt = input.createdAt;
  const author = input.author?.trim();
  if (author) d.author = author;
  if (input.extra && Object.keys(input.extra).length) d.extra = input.extra;
  return d;
}

function cleanList(v: (string | undefined)[] | undefined, keepDuplicates = false): string[] {
  if (!v) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    const s = raw?.trim();
    if (!s) continue;
    if (!keepDuplicates) {
      if (seen.has(s)) continue;
      seen.add(s);
    }
    out.push(s);
  }
  return out;
}

/** Unix seconds / milliseconds / microseconds / ISO / DD-MM-YYYY → ISO-8601 UTC, or undefined. */
export function toIso(
  value: string | number | undefined | null,
  unit?: 's' | 'ms' | 'us',
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return fromEpoch(value, unit);
  const s = String(value).trim();
  if (!s) return undefined;
  if (/^-?\d+$/.test(s)) return fromEpoch(Number(s), unit);
  // 12/03/2024 → DD/MM/YYYY (FR exports); the ambiguous case falls back to day-first.
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const t = Date.UTC(Number(dmy[3]), month - 1, day);
    return Number.isNaN(t) ? undefined : new Date(t).toISOString();
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

function fromEpoch(n: number, unit?: 's' | 'ms' | 'us'): string | undefined {
  if (!Number.isFinite(n) || n === 0) return undefined;
  let ms: number;
  if (unit === 's') ms = n * 1000;
  else if (unit === 'ms') ms = n;
  else if (unit === 'us') ms = n / 1000;
  else {
    const abs = Math.abs(n);
    // < 1e11 is seconds (through year 5138), < 1e14 is milliseconds, beyond that microseconds.
    ms = abs < 1e11 ? n * 1000 : abs < 1e14 ? n : n / 1000;
  }
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** WebKit epoch (microseconds since 1601-01-01) → ISO. Chromium `date_added`. */
export function webkitToIso(value: string | number | undefined): string | undefined {
  if (value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n === 0) return undefined;
  const d = new Date(n / 1000 - 11644473600000);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function splitTags(value: string | undefined, separators = [',', '|', ';']): string[] {
  if (!value) return [];
  const cls = separators.map((s) => '\\' + s).join('');
  return value.split(new RegExp('[' + cls + ']')).map((t) => t.trim()).filter(Boolean);
}

const PATH_JOIN = '␟'; // a visible unit separator; only used as an in-memory Set key

/** Fills `detected` from the drafts so no importer has to. */
export function summarise(
  drafts: BookmarkDraft[],
  malformed: MalformedRow[],
  sourceLabel: string,
): ImportResult {
  const folders = new Set<string>();
  const tags = new Set<string>();
  let min: string | undefined;
  let max: string | undefined;
  for (const d of drafts) {
    if (d.folderPath?.length) folders.add(d.folderPath.join(PATH_JOIN));
    for (const t of d.tags ?? []) tags.add(t);
    if (d.createdAt) {
      if (min === undefined || d.createdAt < min) min = d.createdAt;
      if (max === undefined || d.createdAt > max) max = d.createdAt;
    }
  }
  return {
    drafts,
    malformed,
    detected: {
      folders: folders.size,
      tags: tags.size,
      dateRange: min !== undefined && max !== undefined ? [min, max] : null,
      sourceLabel,
    },
  };
}

// core compiles with lib ES2023 / types: [], so the global is typed structurally (see ports/).
interface TextDecoderLike {
  decode(input?: Uint8Array): string;
}
const TextDecoderCtor = (globalThis as unknown as {
  TextDecoder: new (label?: string) => TextDecoderLike;
}).TextDecoder;

export function srcText(src: { text?: string; bytes?: Uint8Array }): string {
  if (typeof src.text === 'string') return src.text;
  if (src.bytes) return new TextDecoderCtor('utf-8').decode(src.bytes);
  return '';
}
