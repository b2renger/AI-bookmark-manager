import type { DbHandle } from '../ports/index.js';

// sqlite-vec tables (plans/TECHNICAL-DESIGN.md §3.3). Deliberately NOT in a migration: the
// extension is optional, and a migration that throws would wedge the database. The 768-d BLOB in
// `embeddings` is the truth; `vec_docs` is a disposable index keyed by an internal rowid that never
// leaves this machine.

/** True when the sqlite-vec extension is loaded on this connection. */
export function vecAvailable(db: DbHandle): boolean {
  try {
    db.prepare('SELECT vec_version() AS v').get();
    return true;
  } catch {
    return false;
  }
}

/** Create vec_docs / vec_doc_map / vec_dirty if absent. Call only when vecAvailable(db). */
export function ensureVecTables(db: DbHandle, dim: number): void {
  if (!Number.isInteger(dim) || dim < 1 || dim > 8192) {
    throw new Error(`ensureVecTables: dim must be an integer in 1..8192, got ${String(dim)}`);
  }
  db.exec(`
CREATE VIRTUAL TABLE IF NOT EXISTS vec_docs USING vec0(embedding float[${dim}]);
CREATE TABLE IF NOT EXISTS vec_doc_map (
  rowid       INTEGER PRIMARY KEY AUTOINCREMENT,
  bookmark_id TEXT NOT NULL UNIQUE,
  model_id    TEXT NOT NULL,
  built_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vec_dirty (
  bookmark_id TEXT PRIMARY KEY NOT NULL,
  reason      TEXT NOT NULL
);`);
}

/** The dimension vec_docs was built with, or null when the table does not exist. */
export function vecIndexDim(db: DbHandle): number | null {
  try {
    const row = db
      .prepare("SELECT sql AS sql FROM sqlite_master WHERE name = 'vec_docs'")
      .get<{ sql: string }>();
    const m = row?.sql.match(/float\[(\d+)\]/);
    return m?.[1] ? Number(m[1]) : null;
  } catch {
    return null;
  }
}
