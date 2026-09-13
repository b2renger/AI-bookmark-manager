import type { BookmarkDraft, ImportResult, MalformedRow } from '../importers/types.js';
import { makeDraft, splitTags, summarise, toIso } from '../importers/util.js';
import { isProbablyUrl } from '../importers/urlGuard.js';

// The long tail: any CSV (and Notion's property bag) reaches the canonical shape through here.
// plans/TECHNICAL-DESIGN.md §4.2. Heuristics are FR + EN because the user's own exports are FR.

export type CanonicalField =
  | 'url' | 'title' | 'note' | 'summary' | 'tags' | 'folderPath' | 'createdAt' | 'author' | 'ignore';

export interface ColumnSpec {
  field: CanonicalField;
  /** For `tags` and `folderPath`. Defaults: tags `,` — folderPath `/`. */
  tagSeparator?: string;
  dateFormat?: 'iso' | 'unix-s' | 'unix-ms' | 'auto';
}

/** header → what that column means. */
export type ColumnMapping = Record<string, ColumnSpec>;

export interface ApplyMappingResult {
  drafts: BookmarkDraft[];
  malformed: MalformedRow[];
}

const HEADER_PATTERNS: { field: CanonicalField; re: RegExp }[] = [
  { field: 'url', re: /^(url|urls|lien|liens|link|links|href|adresse|address|web ?address|uri)$/i },
  { field: 'title', re: /^(title|titre|name|nom|libell[ée]|label|headline|subject)$/i },
  { field: 'tags', re: /^(tags?|[ée]tiquettes?|mots?[ -]?cl[ée]s?|keywords?|labels?|cat[ée]gories?)$/i },
  { field: 'summary', re: /^(summary|r[ée]sum[ée]|excerpt|extrait|abstract|description)$/i },
  { field: 'note', re: /^(notes?|remarques?|comment(aire)?s?|annotation|highlights?)$/i },
  { field: 'folderPath', re: /^(folder|dossier|collection|path|chemin|parent|group(e)?|r[ée]pertoire)$/i },
  { field: 'createdAt', re: /^(created(_?at)?|date|added|date[_ ]?added|cr[ée]{2}|cr[ée]ation|time_?added|saved(_?at)?|timestamp)$/i },
  { field: 'author', re: /^(author|auteur|creator|by|channel|cha[îi]ne|owner)$/i },
];

function fieldFromHeader(header: string): CanonicalField | null {
  const h = header.trim();
  for (const p of HEADER_PATTERNS) if (p.re.test(h)) return p.field;
  return null;
}

function looksLikeUrlColumn(values: string[]): boolean {
  const filled = values.filter((v) => v.trim() !== '');
  if (filled.length === 0) return false;
  return filled.filter((v) => isProbablyUrl(v)).length / filled.length >= 0.8;
}

function looksLikeDateColumn(values: string[]): boolean {
  const filled = values.filter((v) => v.trim() !== '');
  if (filled.length === 0) return false;
  const dateish = filled.filter((v) => {
    const s = v.trim();
    if (/^\d{9,19}$/.test(s)) return true;
    return !Number.isNaN(Date.parse(s)) && /[-/:T]/.test(s);
  });
  return dateish.length / filled.length >= 0.8;
}

/** Header names first; value sniffing only decides what the names left unclaimed. */
export function inferMapping(headers: string[], sampleRows: Record<string, string>[] = []): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<CanonicalField>();

  for (const h of headers) {
    const field = fieldFromHeader(h);
    if (field && !taken.has(field)) {
      mapping[h] = specFor(field);
      taken.add(field);
    }
  }
  for (const h of headers) {
    if (mapping[h]) continue;
    const values = sampleRows.map((r) => r[h] ?? '');
    if (!taken.has('url') && looksLikeUrlColumn(values)) {
      mapping[h] = { field: 'url' };
      taken.add('url');
      continue;
    }
    if (!taken.has('createdAt') && looksLikeDateColumn(values)) {
      mapping[h] = { field: 'createdAt', dateFormat: 'auto' };
      taken.add('createdAt');
      continue;
    }
    mapping[h] = { field: 'ignore' };
  }
  return mapping;
}

function specFor(field: CanonicalField): ColumnSpec {
  if (field === 'tags') return { field, tagSeparator: ',' };
  if (field === 'folderPath') return { field, tagSeparator: '/' };
  if (field === 'createdAt') return { field, dateFormat: 'auto' };
  return { field };
}

function parseDate(value: string, format: ColumnSpec['dateFormat']): string | undefined {
  if (format === 'unix-s') return toIso(value, 's');
  if (format === 'unix-ms') return toIso(value, 'ms');
  if (format === 'iso') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? undefined : new Date(t).toISOString();
  }
  return toIso(value);
}

export function applyMapping(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): ApplyMappingResult {
  const drafts: BookmarkDraft[] = [];
  const malformed: MalformedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    let url: string | undefined;
    let title: string | undefined;
    let note: string | undefined;
    let summary: string | undefined;
    let author: string | undefined;
    let createdAt: string | undefined;
    let tags: string[] = [];
    let folderPath: string[] = [];
    const extra: Record<string, unknown> = {};

    for (const [header, spec] of Object.entries(mapping)) {
      const raw = row[header];
      if (raw === undefined || raw === '') continue;
      switch (spec.field) {
        case 'url': url = raw.trim(); break;
        case 'title': title = raw; break;
        case 'note': note = note ? `${note}\n\n${raw}` : raw; break;
        case 'summary': summary = raw; break;
        case 'author': author = raw; break;
        case 'createdAt': createdAt = parseDate(raw.trim(), spec.dateFormat ?? 'auto'); break;
        case 'tags': tags = tags.concat(splitTags(raw, [spec.tagSeparator ?? ','])); break;
        case 'folderPath':
          folderPath = raw.split(spec.tagSeparator ?? '/').map((s) => s.trim()).filter(Boolean);
          break;
        case 'ignore': extra[header] = raw; break;
      }
    }

    if (!url || !isProbablyUrl(url)) {
      malformed.push({
        line: i + 1,
        raw: JSON.stringify(row).slice(0, 300),
        reason: url ? `not a URL: ${url.slice(0, 80)}` : 'no url column value',
      });
      continue;
    }
    drafts.push(makeDraft({ url, title, note, summary, author, createdAt, tags, folderPath, extra }));
  }
  return { drafts, malformed };
}

/** `applyMapping` plus the `detected` summary — what every CSV-backed importer returns. */
export function mapRowsToResult(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  sourceLabel: string,
): ImportResult {
  const { drafts, malformed } = applyMapping(rows, mapping);
  return summarise(drafts, malformed, sourceLabel);
}
