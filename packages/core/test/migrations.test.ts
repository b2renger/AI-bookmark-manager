import { describe, expect, it } from 'vitest';
import { LATEST_VERSION, MIGRATIONS } from '../src/db/migrations/index.js';
import { currentVersion, migrate } from '../src/db/migrate.js';
import { LIBRARY_COLLECTION_ID } from '../src/db/migrations/0001_init.js';
import { TABLE_NAMES } from '../src/db/schema.js';
import { Uuid } from '../src/db/schema.js';
import { testDb } from './helpers/db.js';

describe('migrations', () => {
  it('brings a fresh :memory: database to the latest version', () => {
    const t = testDb({ migrate: false });
    try {
      expect(currentVersion(t.db)).toBe(0);
      const res = migrate(t.db);
      expect(res).toEqual({ from: 0, to: LATEST_VERSION, applied: MIGRATIONS.map((m) => m.version) });
      expect(currentVersion(t.db)).toBe(LATEST_VERSION);
    } finally {
      t.close();
    }
  });

  it('creates every table the Zod mirror declares, plus the FTS5 indexes', () => {
    const t = testDb();
    try {
      const names = t.raw
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')")
        .all() as { name: string }[];
      const present = new Set(names.map((r) => r.name));
      for (const table of TABLE_NAMES) expect(present.has(table)).toBe(true);
      expect(present.has('bookmarks_fts')).toBe(true);
      expect(present.has('chunks_fts')).toBe(true);
    } finally {
      t.close();
    }
  });

  it('seeds the fixed library collection with a valid UUIDv7 id', () => {
    const t = testDb();
    try {
      const row = t.raw
        .prepare('SELECT id, name, visibility FROM collections')
        .all() as { id: string; name: string; visibility: string }[];
      expect(row).toHaveLength(1);
      expect(row[0]!.id).toBe(LIBRARY_COLLECTION_ID);
      expect(Uuid.safeParse(LIBRARY_COLLECTION_ID).success).toBe(true);
      expect(row[0]!.visibility).toBe('private');
    } finally {
      t.close();
    }
  });

  it('is a no-op when run twice, and calls onBeforeUpgrade only when the version rises', () => {
    const t = testDb({ migrate: false });
    try {
      const seen: [number, number][] = [];
      migrate(t.db, { onBeforeUpgrade: (from, to) => seen.push([from, to]) });
      const second = migrate(t.db, { onBeforeUpgrade: (from, to) => seen.push([from, to]) });
      expect(second).toEqual({ from: LATEST_VERSION, to: LATEST_VERSION, applied: [] });
      expect(seen).toEqual([[0, LATEST_VERSION]]);
      expect(t.raw.prepare('SELECT count(*) AS n FROM collections').get()).toEqual({ n: 1 });
    } finally {
      t.close();
    }
  });

  it('restores foreign_keys after migrating', () => {
    const t = testDb();
    try {
      expect(t.raw.pragma('foreign_keys', { simple: true })).toBe(1);
    } finally {
      t.close();
    }
  });
});
