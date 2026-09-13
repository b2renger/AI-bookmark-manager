import { parseCsv } from '../csv/parse.js';
import type { BookmarkDraft, ImportResult, Importer, ImportSource, MalformedRow } from './types.js';
import { makeDraft, splitTags, summarise, srcText, toIso } from './util.js';
import { isProbablyUrl } from './urlGuard.js';

// Pocket's final export: a ZIP of CSVs split every 10k rows (the host unzips and concatenates or
// calls parse once per part). Columns: title,url,time_added,tags,status.

const SOURCE_LABEL = 'Pocket (CSV)';

export function sniffPocket(src: ImportSource): number {
  const text = srcText(src);
  if (!text.trim()) return 0;
  const header = (text.split('\n', 1)[0] ?? '').toLowerCase();
  const has = (h: string) => header.includes(h);
  if (has('time_added') && has('url') && has('status')) return 1;
  if (has('time_added') && has('url')) return 0.8;
  return 0;
}

export function parsePocket(text: string): ImportResult {
  const { rows } = parseCsv(text, { delimiter: 'auto' });
  const drafts: BookmarkDraft[] = [];
  const malformed: MalformedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const url = (row['url'] ?? row['URL'] ?? '').trim();
    if (!url || !isProbablyUrl(url)) {
      malformed.push({
        line: i + 1,
        raw: JSON.stringify(row).slice(0, 300),
        reason: url ? `not a URL: ${url.slice(0, 80)}` : 'no url column value',
      });
      continue;
    }
    const status = (row['status'] ?? '').trim();
    const extra: Record<string, unknown> = {};
    if (status) extra['status'] = status;

    drafts.push(makeDraft({
      url,
      title: row['title'],
      // Pocket writes `a|b|c` in the web export and `a,b,c` in some older ones.
      tags: splitTags(row['tags'], ['|', ',']),
      createdAt: toIso(row['time_added'], 's'),
      extra,
    }));
  }
  return summarise(drafts, malformed, SOURCE_LABEL);
}

export const pocketImporter: Importer = {
  id: 'pocket',
  sniff: sniffPocket,
  parse: (src: ImportSource): ImportResult => parsePocket(srcText(src)),
};
