import { LIBRARY_COLLECTION_ID } from '../db/migrations/index.js';
import type { DbHandle, SqlValue } from '../ports/index.js';
import { buildFtsQuery } from '../search/fts.js';
import { decodeCursor, encodeCursor, isOffsetCursor } from './cursor.js';
import type {
  BookmarkRowDto, FacetBucket, LibraryQueryInput, LibrarySort, Page, TagRefDto,
} from './dto.js';

// library:query (channel 2). One SQL statement per concern and no N+1: the page, its COUNT, its
// two facet groups and the tags of the whole page. Filtering and sorting are the database's job —
// 100k rows cannot be filtered in JS (§6.3).

export const MAX_LIMIT = 500;
export const DEFAULT_LIMIT = 200;
/** SQLite's default SQLITE_MAX_VARIABLE_NUMBER is 32766; stay well inside it. */
const IN_CHUNK = 500;

export function chunked<T>(items: readonly T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const SELECT_COLUMNS = `
  b.id, b.collection_id, b.url, b.url_norm, b.title, b.summary, b.summary_kind, b.platform,
  b.lang, b.status, b.starred, b.confidence, b.confidence_reason, b.acquisition_method,
  b.thumbnail_url, b.author, b.created_at, b.updated_at, b.open_count`;

interface RawRow {
  id: string;
  collection_id: string;
  url: string;
  url_norm: string;
  title: string | null;
  summary: string | null;
  summary_kind: string;
  platform: string | null;
  lang: string | null;
  status: string;
  starred: number;
  confidence: number | null;
  confidence_reason: string | null;
  acquisition_method: string | null;
  thumbnail_url: string | null;
  author: string | null;
  created_at: string;
  updated_at: string;
  open_count: number;
}

interface SortSpec {
  /** The SQL expression the keyset compares. Total order: no NULLs, no ties but the id. */
  expr: string;
  dir: 'ASC' | 'DESC';
  /** Reads the same value back out of the row, for the next cursor. */
  key: (row: RawRow) => string | number;
}

const SORTS: Record<LibrarySort, SortSpec> = {
  created_desc: { expr: 'b.created_at', dir: 'DESC', key: (r) => r.created_at },
  created_asc: { expr: 'b.created_at', dir: 'ASC', key: (r) => r.created_at },
  title: { expr: 'b.title', dir: 'ASC', key: (r) => r.title ?? '' },
  // COALESCE rather than `IS NULL` ordering so the keyset comparison stays a plain inequality.
  confidence_desc: {
    expr: 'COALESCE(b.confidence, -1)',
    dir: 'DESC',
    key: (r) => r.confidence ?? -1,
  },
  updated_desc: { expr: 'b.updated_at', dir: 'DESC', key: (r) => r.updated_at },
};

interface Where {
  sql: string[];
  params: SqlValue[];
}

function baseWhere(q: LibraryQueryInput, skip?: 'platform' | 'status'): Where {
  const sql: string[] = ['b.deleted_at IS NULL', 'b.collection_id = ?'];
  const params: SqlValue[] = [q.collectionId ?? LIBRARY_COLLECTION_ID];

  if (q.platform !== undefined && skip !== 'platform') {
    sql.push('b.platform = ?');
    params.push(q.platform);
  }
  if (q.status !== undefined && skip !== 'status') {
    sql.push('b.status = ?');
    params.push(q.status);
  }
  if (q.dateFrom !== undefined) {
    sql.push('b.created_at >= ?');
    params.push(q.dateFrom);
  }
  if (q.dateTo !== undefined) {
    sql.push('b.created_at <= ?');
    params.push(q.dateTo);
  }
  for (const tagId of q.tagIds ?? []) {
    sql.push(
      'EXISTS (SELECT 1 FROM bookmark_tags bt WHERE bt.bookmark_id = b.id AND bt.tag_id = ? AND bt.accepted = 1)',
    );
    params.push(tagId);
  }
  return { sql, params };
}

/** '' when the text has no usable token — the caller then treats it as "no text filter". */
function ftsExpression(text: string | undefined): string {
  return text === undefined || text.trim() === '' ? '' : buildFtsQuery(text);
}

export function tagsForBookmarks(db: DbHandle, ids: readonly string[]): Map<string, TagRefDto[]> {
  const out = new Map<string, TagRefDto[]>();
  if (ids.length === 0) return out;
  for (const batch of chunked(ids)) {
    const rows = db
      .prepare(
        `SELECT bt.bookmark_id AS bookmarkId, t.id AS id, t.label AS label,
                bt.source AS source, bt.accepted AS accepted
           FROM bookmark_tags bt
           JOIN tags t ON t.id = bt.tag_id
          WHERE bt.accepted = 1 AND t.deleted_at IS NULL
            AND bt.bookmark_id IN (${batch.map(() => '?').join(',')})
          ORDER BY t.label_norm`,
      )
      .all<{ bookmarkId: string; id: string; label: string; source: string; accepted: number }>(
        ...batch,
      );
    for (const row of rows) {
      const list = out.get(row.bookmarkId) ?? [];
      list.push({
        id: row.id,
        label: row.label,
        source: row.source as TagRefDto['source'],
        accepted: row.accepted === 1,
      });
      out.set(row.bookmarkId, list);
    }
  }
  return out;
}

export function toRowDto(row: RawRow, tags: TagRefDto[]): BookmarkRowDto {
  return {
    id: row.id,
    collectionId: row.collection_id,
    url: row.url,
    urlNorm: row.url_norm,
    title: row.title,
    summary: row.summary,
    summaryKind: row.summary_kind as BookmarkRowDto['summaryKind'],
    platform: row.platform as BookmarkRowDto['platform'],
    lang: row.lang,
    status: row.status as BookmarkRowDto['status'],
    starred: row.starred === 1,
    confidence: row.confidence,
    confidenceReason: row.confidence_reason,
    acquisitionMethod: row.acquisition_method,
    thumbnailUrl: row.thumbnail_url,
    author: row.author,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags,
    openCount: row.open_count,
  };
}

function facet(
  db: DbHandle,
  q: LibraryQueryInput,
  column: 'platform' | 'status',
  match: string,
): FacetBucket[] {
  const where = baseWhere(q, column);
  const join = match === '' ? '' : 'JOIN bookmarks_fts ON bookmarks_fts.rowid = b.rowid';
  const params = [...where.params];
  if (match !== '') {
    where.sql.push('bookmarks_fts MATCH ?');
    params.push(match);
  }
  return db
    .prepare(
      `SELECT b.${column} AS key, COUNT(*) AS count
         FROM bookmarks b ${join}
        WHERE ${where.sql.join(' AND ')} AND b.${column} IS NOT NULL
        GROUP BY b.${column}
        ORDER BY count DESC, key ASC`,
    )
    .all<FacetBucket>(...params);
}

export function queryLibrary(db: DbHandle, q: LibraryQueryInput): Page<BookmarkRowDto> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(q.limit) || DEFAULT_LIMIT));
  const match = ftsExpression(q.text);
  const cursor = decodeCursor(q.cursor);
  const where = baseWhere(q);
  const params = [...where.params];

  if (match !== '') {
    where.sql.push('bookmarks_fts MATCH ?');
    params.push(match);
  }

  const total =
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM bookmarks b
         ${match === '' ? '' : 'JOIN bookmarks_fts ON bookmarks_fts.rowid = b.rowid'}
          WHERE ${where.sql.join(' AND ')}`,
      )
      .get<{ n: number }>(...params)?.n ?? 0;

  let rows: RawRow[];
  let nextCursor: string | null = null;

  if (match !== '') {
    // Text search: bm25 is a whole-query ranking, so the cursor is an offset (see cursor.ts).
    const offset = cursor !== null && isOffsetCursor(cursor) ? cursor.o : 0;
    rows = db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
           FROM bookmarks b
           JOIN bookmarks_fts ON bookmarks_fts.rowid = b.rowid
          WHERE ${where.sql.join(' AND ')}
          ORDER BY bm25(bookmarks_fts) ASC, b.id ASC
          LIMIT ? OFFSET ?`,
      )
      .all<RawRow>(...params, limit + 1, offset);
    if (rows.length > limit) {
      rows = rows.slice(0, limit);
      nextCursor = encodeCursor({ o: offset + limit });
    }
  } else {
    const sort = SORTS[q.sort] ?? SORTS.created_desc;
    const keyed = [...params];
    if (cursor !== null && !isOffsetCursor(cursor)) {
      const cmp = sort.dir === 'DESC' ? '<' : '>';
      where.sql.push(`(${sort.expr} ${cmp} ? OR (${sort.expr} = ? AND b.id ${cmp} ?))`);
      const k: SqlValue = cursor.k === null ? '' : (cursor.k as SqlValue);
      keyed.push(k, k, cursor.i);
    }
    rows = db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
           FROM bookmarks b
          WHERE ${where.sql.join(' AND ')}
          ORDER BY ${sort.expr} ${sort.dir}, b.id ${sort.dir}
          LIMIT ?`,
      )
      .all<RawRow>(...keyed, limit + 1);
    if (rows.length > limit) {
      rows = rows.slice(0, limit);
      const last = rows[rows.length - 1]!;
      nextCursor = encodeCursor({ k: sort.key(last), i: last.id });
    }
  }

  const tags = tagsForBookmarks(db, rows.map((r) => r.id));
  const page: Page<BookmarkRowDto> = {
    items: rows.map((r) => toRowDto(r, tags.get(r.id) ?? [])),
    nextCursor,
    total,
  };
  // Facets are two extra aggregates; the table only shows them above the first page.
  if (cursor === null) {
    page.facets = {
      platform: facet(db, q, 'platform', match),
      status: facet(db, q, 'status', match),
    };
  }
  return page;
}
