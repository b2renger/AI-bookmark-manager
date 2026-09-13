import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../src/db/migrations/index.js';
import { TABLE_NAMES, tableColumns } from '../src/db/schema.js';
import { SHAREABLE_ENTITIES } from '../src/ops/types.js';
import { testDb } from './helpers/db.js';

// Drift test (plans/TECHNICAL-DESIGN.md §3.4): the Zod mirror is hand-written, so the only thing
// keeping it honest is reading the real schema back out of a freshly migrated database.

/** The rule, stated exactly: every shareable table carries `collection_id` except
 *  (a) `collections`, which IS the collection — its `id` is the collection id; and
 *  (b) the rows that derive it from a parent they point at — `bookmark_tags` and
 *      `theme_assignments` (join rows, via bookmark_id) and `tag_aliases` (via tag_id).
 *  `members` is NOT exempt: it carries collection_id. */
const DERIVES_COLLECTION_ID = new Set(['bookmark_tags', 'theme_assignments', 'tag_aliases']);
const IS_THE_COLLECTION = 'collections';

function columnsOf(raw: import('better-sqlite3').Database, table: string): string[] {
  const info = raw.pragma(`table_info(${table})`) as { name: string }[];
  return info.map((c) => c.name);
}

describe('schema', () => {
  const t = testDb();

  it.each(TABLE_NAMES)('%s: the Zod object mirrors PRAGMA table_info', (table) => {
    const actual = columnsOf(t.raw, table);
    expect(actual.length).toBeGreaterThan(0);
    expect([...actual].sort()).toEqual([...tableColumns(table)].sort());
  });

  it('declares no AUTOINCREMENT anywhere in the migrations', () => {
    // The only AUTOINCREMENT in the design is vec_doc_map.rowid, and that table lives in db/vec.ts
    // (created on demand, never migrated) precisely because it is a disposable local index.
    for (const m of MIGRATIONS) {
      expect(m.sql).not.toMatch(/AUTOINCREMENT/i);
    }
  });

  it('keeps WITHOUT ROWID to knn_edges only', () => {
    const statements = MIGRATIONS.map((m) => m.sql).join('\n').split(';');
    const hits = statements.filter((s) => /WITHOUT ROWID/i.test(s));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/CREATE TABLE knn_edges/);
  });

  it.each(SHAREABLE_ENTITIES)('%s carries collection_id unless it derives one', (entity) => {
    const cols = columnsOf(t.raw, entity);
    if (entity === IS_THE_COLLECTION) {
      expect(cols).toContain('id');
      expect(cols).not.toContain('collection_id');
      return;
    }
    if (DERIVES_COLLECTION_ID.has(entity)) {
      expect(cols).not.toContain('collection_id');
      // the exemption is only sound if the row points at a parent that has one
      expect(cols.some((c) => c === 'bookmark_id' || c === 'tag_id')).toBe(true);
      return;
    }
    expect(cols).toContain('collection_id');
  });

  it('has a UUIDv7 TEXT primary key on every shareable row table', () => {
    for (const entity of SHAREABLE_ENTITIES) {
      const info = t.raw.pragma(`table_info(${entity})`) as { name: string; type: string; pk: number }[];
      const pk = info.filter((c) => c.pk > 0);
      expect(pk.length).toBeGreaterThan(0);
      for (const c of pk) expect(['TEXT', 'REAL']).toContain(c.type);
    }
  });
});
