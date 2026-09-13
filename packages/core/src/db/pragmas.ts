import type { DbHandle } from '../ports/index.js';

// Per-connection pragmas (plans/TECHNICAL-DESIGN.md §3). Never in a migration: they are properties
// of the connection, not of the file — except journal_mode, which is persistent and set once.

/** `DbHandle.pragma` returns whatever the driver returns. better-sqlite3 gives
 *  `[{ journal_mode: 'wal' }]`; a simpler adapter may give the scalar. Tolerate both. */
export function pragmaValue(db: DbHandle, statement: string): unknown {
  const raw = db.pragma(statement);
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first !== null && typeof first === 'object') return Object.values(first)[0];
  return first;
}

export function applyConnectionPragmas(db: DbHandle): void {
  // WAL is persistent and meaningless for an in-memory database, which reports 'memory'.
  const mode = String(pragmaValue(db, 'journal_mode') ?? '').toLowerCase();
  if (mode !== 'memory') db.pragma('journal_mode = WAL');

  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('mmap_size = 268435456'); // 256 MB
  db.pragma('cache_size = -65536'); // 64 MB
  db.pragma('temp_store = MEMORY');
  db.pragma('analysis_limit = 400'); // bounds the `PRAGMA optimize` run on close
}
