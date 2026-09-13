import type { ColumnMapping } from '../csv/mapping.js';
import { mapRowsToResult } from '../csv/mapping.js';
import { parseCsv } from '../csv/parse.js';
import type { ImportResult, Importer, ImportSource } from './types.js';
import { srcText } from './util.js';

// Raindrop.io CSV export: folder,title,note,excerpt,url,tags,created — a thin preset over the
// generic mapper. `excerpt` is Raindrop's auto-extract, which is our `summary`.

const SOURCE_LABEL = 'Raindrop.io (CSV)';

export const RAINDROP_MAPPING: ColumnMapping = {
  folder: { field: 'folderPath', tagSeparator: '/' },
  title: { field: 'title' },
  note: { field: 'note' },
  excerpt: { field: 'summary' },
  url: { field: 'url' },
  tags: { field: 'tags', tagSeparator: ',' },
  created: { field: 'createdAt', dateFormat: 'auto' },
  cover: { field: 'ignore' },
  highlights: { field: 'note' },
  favorite: { field: 'ignore' },
};

export function sniffRaindrop(src: ImportSource): number {
  const text = srcText(src);
  if (!text.trim()) return 0;
  const header = text.split('\n', 1)[0]?.toLowerCase() ?? '';
  const has = (h: string) => header.includes(h);
  if (has('excerpt') && has('url') && has('folder')) return 1;
  if (has('excerpt') && has('url')) return 0.7;
  return 0;
}

export function parseRaindrop(text: string): ImportResult {
  const { headers, rows } = parseCsv(text, { delimiter: 'auto' });
  const mapping: ColumnMapping = {};
  for (const h of headers) {
    const preset = RAINDROP_MAPPING[h.trim().toLowerCase()];
    mapping[h] = preset ?? { field: 'ignore' };
  }
  return mapRowsToResult(rows, mapping, SOURCE_LABEL);
}

export const raindropImporter: Importer = {
  id: 'raindrop',
  sniff: sniffRaindrop,
  parse: (src: ImportSource): ImportResult => parseRaindrop(srcText(src)),
};
