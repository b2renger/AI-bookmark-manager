import { FTS_TRIGGERS_SQL, FTS_TRIGGER_NAMES } from '../db/migrations/index.js';
import type { DbHandle } from '../ports/index.js';
import { stem } from './stems.js';

// FTS5 query builder and helpers (plans/TECHNICAL-DESIGN.md §3.2). The index folds diacritics at
// write time (`unicode61 remove_diacritics 2`), so the query is folded the same way — that single
// setting is what makes `café` and `cafe` one term in a French corpus. There is no Snowball
// stemmer, so search/stems.ts folds the query instead, and the last token carries a `*` so typing
// is incremental.

export interface FtsQueryOptions {
  /** 'fr' | 'en' pick the stem map; `null` disables stemming (exact-term search). */
  lang?: 'fr' | 'en' | null;
}

export interface FtsHit {
  rowid: number;
  id: string;
  rank: number;
}

/** NFD-decompose, drop combining marks, lowercase — the same folding FTS5 does at index time. */
export function foldDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function tokenise(s: string): string[] {
  return foldDiacritics(s)
    .split(/[^0-9a-z]+/u)
    .filter((t) => t.length > 0);
}

/** An FTS5 MATCH expression: quoted tokens joined by implicit AND, prefix `*` on the last one.
 *  Returns '' for input with no usable token — the caller must treat that as "no filter". */
export function buildFtsQuery(input: string, opts: FtsQueryOptions = {}): string {
  const lang = opts.lang === undefined ? 'fr' : opts.lang;
  const tokens = tokenise(input).map((t) => (lang === null ? t : stem(t)));
  if (tokens.length === 0) return '';
  return tokens
    .map((t, i) => `"${t}"${i === tokens.length - 1 ? '*' : ''}`)
    .join(' AND ');
}

export function ftsSearchBookmarks(
  db: DbHandle,
  q: string,
  opts: { limit?: number; offset?: number } = {},
): FtsHit[] {
  if (q.length === 0) return [];
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  return db
    .prepare(
      `SELECT b.rowid AS rowid, b.id AS id, bm25(bookmarks_fts) AS rank
         FROM bookmarks_fts
         JOIN bookmarks b ON b.rowid = bookmarks_fts.rowid
        WHERE bookmarks_fts MATCH ? AND b.deleted_at IS NULL
        ORDER BY bm25(bookmarks_fts) ASC
        LIMIT ? OFFSET ?`,
    )
    .all<FtsHit>(q, limit, offset);
}

/** Rebuild both external-content indexes from their content tables.
 *  `bookmarks_fts` cannot use FTS5's own 'rebuild': its `url_text` column is derived from
 *  `bookmarks.url_norm` by the triggers and has no counterpart on the content table, so rebuild
 *  would fail with "no such column: T.url_text". Clear and re-project explicitly instead — the
 *  expression below is the same one the triggers use. `chunks_fts` maps 1:1 and can rebuild. */
export function ftsRebuild(db: DbHandle): void {
  db.exec(
    `INSERT INTO bookmarks_fts(bookmarks_fts) VALUES('delete-all');
     INSERT INTO bookmarks_fts(rowid,title,summary,note,author,url_text)
       SELECT rowid, title, summary, note, coalesce(author,''),
              replace(replace(url_norm,'/',' '),'-',' ')
         FROM bookmarks;
     INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild');`,
  );
}

/** Bulk-import switch: drop the six sync triggers, insert, then recreate and ftsRebuild(). That is
 *  what keeps a 100k import inside 60 s (§3.2). */
export function ftsSetTriggers(db: DbHandle, on: boolean): void {
  if (on) {
    db.exec(FTS_TRIGGERS_SQL);
    return;
  }
  db.exec(FTS_TRIGGER_NAMES.map((n) => `DROP TRIGGER IF EXISTS ${n};`).join('\n'));
}

export { stem, STEMS } from './stems.js';
