import type { BookmarkDraft, ImportResult, Importer, ImportSource, MalformedRow } from './types.js';
import { makeDraft, summarise, toIso } from './util.js';

// Firefox keeps bookmarks in `places.sqlite`, which is WAL-locked while the browser runs. The HOST
// copies the file, opens the copy, runs FIREFOX_QUERY_SQL and hands core the rows — core never sees
// a filesystem or a DbHandle here. plans/TECHNICAL-DESIGN.md §4.2.

const SOURCE_LABEL = 'Firefox places.sqlite';

/**
 * Rows expected by `parse` (ImportSource.kind === 'rows'). `folderTitles` is the `/`-joined
 * ancestor chain produced by the recursive CTE, root first, excluding the row itself.
 */
export interface FirefoxRow {
  id: string | number;
  parent: string | number;
  title: string | null;
  url: string;
  /** `moz_bookmarks.dateAdded`, microseconds since the Unix epoch. */
  dateAdded: string | number | null;
  folderTitles?: string | null;
}

/**
 * The query the host runs over the copied places.sqlite. `type = 1` is a bookmark (2 is a folder,
 * 3 a separator); the roots (`menu________`, `toolbar_____`, `unfiled_____`, `mobile______`,
 * `tags________`) are excluded from the path so it matches what the user sees.
 */
export const FIREFOX_QUERY_SQL = `
WITH RECURSIVE ancestry(id, parent, path) AS (
  SELECT b.id, b.parent, ''
    FROM moz_bookmarks b
   WHERE b.parent = 0 OR b.guid IN
         ('root________','menu________','toolbar_____','unfiled_____','mobile______','tags________')
  UNION ALL
  SELECT c.id, c.parent,
         CASE WHEN a.path = '' THEN IFNULL(c.title, '')
              ELSE a.path || '/' || IFNULL(c.title, '') END
    FROM moz_bookmarks c
    JOIN ancestry a ON c.parent = a.id
   WHERE c.type = 2
)
SELECT b.id          AS id,
       b.parent      AS parent,
       b.title       AS title,
       p.url         AS url,
       b.dateAdded   AS dateAdded,
       a.path        AS folderTitles
  FROM moz_bookmarks b
  JOIN moz_places p ON b.fk = p.id
  LEFT JOIN ancestry a ON a.id = b.parent
 WHERE b.type = 1
   AND p.url NOT LIKE 'place:%'
 ORDER BY b.id
`.trim();

export function sniffFirefox(src: ImportSource): number {
  if (src.kind !== 'rows' || !src.rows?.length) return 0;
  const first = src.rows[0]!;
  const hasShape = 'url' in first && ('dateAdded' in first || 'folderTitles' in first);
  return hasShape ? 0.9 : 0;
}

export function parseFirefoxRows(rows: readonly FirefoxRow[]): ImportResult {
  const drafts: BookmarkDraft[] = [];
  const malformed: MalformedRow[] = [];

  for (const row of rows) {
    if (!row?.url) {
      malformed.push({ raw: JSON.stringify(row).slice(0, 200), reason: 'row without url' });
      continue;
    }
    drafts.push(makeDraft({
      url: row.url,
      title: row.title ?? undefined,
      folderPath: (row.folderTitles ?? '').split('/').map((s) => s.trim()).filter(Boolean),
      createdAt: toIso(row.dateAdded ?? undefined, 'us'),
      extra: { firefoxId: row.id },
    }));
  }
  return summarise(drafts, malformed, SOURCE_LABEL);
}

export const firefoxImporter: Importer = {
  id: 'firefox',
  sniff: sniffFirefox,
  parse(src: ImportSource): ImportResult {
    if (src.kind !== 'rows' || !src.rows) {
      return summarise([], [{ raw: '', reason: 'firefox importer needs kind:"rows"' }], SOURCE_LABEL);
    }
    return parseFirefoxRows(src.rows as unknown as FirefoxRow[]);
  },
};
