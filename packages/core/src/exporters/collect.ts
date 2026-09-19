import { applyOps } from '../ops/applyOp.js';
import type { OpContext, OpInput, ShareableEntity } from '../ops/types.js';
import type { DbHandle } from '../ports/index.js';
import { EXPORT_SCHEMA, type BookmarkExportRow, type ExportRecord } from './types.js';

// Reading the export out of the database (§4.3). Generators, not arrays: a 100k library streams
// through `writeJsonl` one record at a time and never materialises.

export interface CollectOptions {
  appVersion: string;
  dbVersion: number;
  exportedAt?: string;
  /** Restrict to one collection; omitted means the whole database. */
  collectionId?: string;
}

function count(db: DbHandle, sql: string, params: string[]): number {
  return db.prepare(sql).get<{ n: number }>(...params)?.n ?? 0;
}

/** The lossless JSONL stream: header, collections, bookmarks (+versions/chunks/tags), tags, ops. */
export function* collectExportRecords(
  db: DbHandle,
  opts: CollectOptions,
): Generator<ExportRecord> {
  const where = opts.collectionId === undefined ? '' : ' WHERE collection_id = ?';
  const params = opts.collectionId === undefined ? [] : [opts.collectionId];

  yield {
    t: 'header',
    $schema: EXPORT_SCHEMA,
    exportedAt: opts.exportedAt ?? new Date().toISOString(),
    app: opts.appVersion,
    dbVersion: opts.dbVersion,
    counts: {
      collections: count(db, `SELECT COUNT(*) AS n FROM collections${where.replace(' WHERE collection_id = ?', ' WHERE id = ?')}`, params),
      bookmarks: count(db, `SELECT COUNT(*) AS n FROM bookmarks${where}`, params),
      tags: count(db, `SELECT COUNT(*) AS n FROM tags${where}`, params),
      ops: count(db, `SELECT COUNT(*) AS n FROM ops${where}`, params),
    },
  };

  const collectionSql = opts.collectionId === undefined
    ? 'SELECT * FROM collections'
    : 'SELECT * FROM collections WHERE id = ?';
  for (const v of db.prepare(collectionSql).iterate<Record<string, unknown>>(...params)) {
    yield { t: 'collection', v };
  }

  const versions = db.prepare('SELECT * FROM content_versions WHERE bookmark_id = ?');
  const chunks = db.prepare('SELECT * FROM chunks WHERE bookmark_id = ? ORDER BY ord');
  const bookmarkTags = db.prepare('SELECT * FROM bookmark_tags WHERE bookmark_id = ?');

  for (const v of db
    .prepare(`SELECT * FROM bookmarks${where} ORDER BY created_at`)
    .iterate<Record<string, unknown>>(...params)) {
    const id = String(v['id']);
    yield {
      t: 'bookmark',
      v,
      versions: versions.all<Record<string, unknown>>(id),
      chunks: chunks.all<Record<string, unknown>>(id),
      tags: bookmarkTags.all<Record<string, unknown>>(id),
    };
  }

  for (const v of db
    .prepare(`SELECT * FROM tags${where}`)
    .iterate<Record<string, unknown>>(...params)) {
    yield { t: 'tag', v };
  }

  for (const v of db
    .prepare(`SELECT * FROM ops${where} ORDER BY hlc`)
    .iterate<Record<string, unknown>>(...params)) {
    yield { t: 'op', v };
  }
}

interface ExportRowRaw {
  id: string;
  url: string;
  title: string | null;
  summary: string | null;
  note: string | null;
  created_at: string;
  platform: string | null;
  author: string | null;
  tag_labels: string | null;
}

/** The flat rows the lossy exporters consume. Tags are group_concat'ed, so still one query. */
export function* collectExportRows(
  db: DbHandle,
  collectionId?: string,
): Generator<BookmarkExportRow> {
  const where = collectionId === undefined ? '' : ' AND b.collection_id = ?';
  const params = collectionId === undefined ? [] : [collectionId];
  const rows = db
    .prepare(
      `SELECT b.id, b.url, b.title, b.summary, b.note, b.created_at, b.platform, b.author,
              (SELECT group_concat(t.label, char(31))
                 FROM bookmark_tags bt JOIN tags t ON t.id = bt.tag_id
                WHERE bt.bookmark_id = b.id AND bt.accepted = 1) AS tag_labels
         FROM bookmarks b
        WHERE b.deleted_at IS NULL${where}
        ORDER BY b.created_at`,
    )
    .iterate<ExportRowRaw>(...params);

  for (const row of rows) {
    const out: BookmarkExportRow = {
      id: row.id,
      url: row.url,
      tags: row.tag_labels ? row.tag_labels.split('') : [],
    };
    if (row.title) out.title = row.title;
    if (row.summary) out.summary = row.summary;
    if (row.note) out.note = row.note;
    if (row.created_at) out.createdAt = row.created_at;
    if (row.platform) out.platform = row.platform;
    if (row.author) out.author = row.author;
    yield out;
  }
}

export interface ImportRecordsResult {
  collections: number;
  bookmarks: number;
  tags: number;
  links: number;
  skipped: number;
}

function exists(db: DbHandle, table: 'collections' | 'bookmarks' | 'tags', id: string): boolean {
  return db.prepare(`SELECT 1 AS n FROM ${table} WHERE id = ?`).get<{ n: number }>(id) !== undefined;
}

/**
 * The other half of the round-trip contract: JSONL records back into a database. Rows already
 * present are skipped rather than merged — P0 restores into a fresh library; the LWW merge of a
 * *shared* bundle is `ops/mergeEntity` and belongs to P6.
 */
export function importJsonlRecords(
  ctx: OpContext,
  records: Iterable<ExportRecord>,
): ImportRecordsResult {
  const result: ImportRecordsResult = {
    collections: 0, bookmarks: 0, tags: 0, links: 0, skipped: 0,
  };
  const ops: OpInput[] = [];

  const create = (entity: ShareableEntity, v: Record<string, unknown>): void => {
    ops.push({
      collectionId: String(v['collection_id'] ?? v['id'] ?? ''),
      entity,
      entityId: String(v['id']),
      op: 'create',
      value: v,
    });
  };

  for (const record of records) {
    switch (record.t) {
      case 'header':
      case 'op':
        break;
      case 'collection': {
        if (exists(ctx.db, 'collections', String(record.v['id']))) {
          result.skipped += 1;
          break;
        }
        create('collections', record.v);
        result.collections += 1;
        break;
      }
      case 'tag': {
        if (exists(ctx.db, 'tags', String(record.v['id']))) {
          result.skipped += 1;
          break;
        }
        create('tags', record.v);
        result.tags += 1;
        break;
      }
      case 'bookmark': {
        const id = String(record.v['id']);
        if (exists(ctx.db, 'bookmarks', id)) {
          result.skipped += 1;
          break;
        }
        create('bookmarks', record.v);
        result.bookmarks += 1;
        for (const link of record.tags ?? []) {
          ops.push({
            collectionId: String(record.v['collection_id'] ?? ''),
            entity: 'bookmark_tags',
            entityId: id,
            field: String(link['tag_id']),
            op: 'link',
            value: link,
          });
          result.links += 1;
        }
        break;
      }
    }
  }

  // Tags are emitted after the bookmarks that link them, so the whole restore is one transaction
  // and the link rows land only once their tag row exists.
  ops.sort((a, b) => rank(a) - rank(b));
  if (ops.length > 0) applyOps(ctx, ops);
  return result;
}

function rank(op: OpInput): number {
  if (op.entity === 'collections') return 0;
  if (op.entity === 'tags') return 1;
  if (op.entity === 'bookmarks') return 2;
  return 3;
}
