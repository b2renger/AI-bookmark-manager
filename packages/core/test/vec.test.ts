import { describe, expect, it } from 'vitest';
import { ensureVecTables, vecAvailable, vecIndexDim } from '../src/db/vec.js';
import { testDb } from './helpers/db.js';

describe('sqlite-vec tables', () => {
  it('reports unavailable when the extension is not loaded', () => {
    const t = testDb();
    try {
      expect(vecAvailable(t.db)).toBe(false);
      expect(vecIndexDim(t.db)).toBe(null);
    } finally {
      t.close();
    }
  });

  it('rejects a nonsense dimension', () => {
    const t = testDb();
    try {
      expect(() => ensureVecTables(t.db, 0)).toThrow();
      expect(() => ensureVecTables(t.db, 1.5)).toThrow();
    } finally {
      t.close();
    }
  });

  it('creates vec_docs, vec_doc_map and vec_dirty when the extension loads', () => {
    const t = testDb({ vec: true });
    try {
      if (!t.vec) {
        // sqlite-vec has no prebuild for this platform: the DB must still be fully usable.
        expect(vecAvailable(t.db)).toBe(false);
        return;
      }
      expect(vecIndexDim(t.db)).toBe(256);
      ensureVecTables(t.db, 256); // idempotent
      const names = t.raw
        .prepare("SELECT name FROM sqlite_master WHERE name LIKE 'vec_%'")
        .all() as { name: string }[];
      const present = new Set(names.map((n) => n.name));
      for (const n of ['vec_docs', 'vec_doc_map', 'vec_dirty']) expect(present.has(n)).toBe(true);
    } finally {
      t.close();
    }
  });
});
