import type { DbHandle, Logger } from '../ports/index.js';
import { LATEST_VERSION, MIGRATIONS } from './migrations/index.js';
import { pragmaValue } from './pragmas.js';

// plans/TECHNICAL-DESIGN.md §3.9. `PRAGMA user_version` is the schema version; each migration runs
// in its own BEGIN IMMEDIATE…COMMIT so a crash halfway through a chain leaves a consistent
// (earlier) schema rather than a half-applied one.

export interface MigrateOptions {
  log?: Logger;
  /** Called once, before the first migration of this session, when user_version will rise.
   *  The host uses it to snapshot the file (§3.9's `library.db.pre-<n>.bak`). */
  onBeforeUpgrade?: (from: number, to: number) => void;
}

export interface MigrateResult {
  from: number;
  to: number;
  applied: number[];
}

export function currentVersion(db: DbHandle): number {
  return Number(pragmaValue(db, 'user_version') ?? 0);
}

export function migrate(db: DbHandle, opts: MigrateOptions = {}): MigrateResult {
  const from = currentVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > from).sort((a, b) => a.version - b.version);
  if (pending.length === 0) return { from, to: from, applied: [] };

  const target = pending[pending.length - 1]!.version;
  opts.onBeforeUpgrade?.(from, target);

  // foreign_keys is a no-op inside a transaction, so it is toggled outside the BEGIN.
  const fkWasOn = pragmaValue(db, 'foreign_keys') === 1 || pragmaValue(db, 'foreign_keys') === true;
  db.pragma('foreign_keys = OFF');
  const applied: number[] = [];
  try {
    for (const m of pending) {
      opts.log?.info('migrate: applying', { version: m.version, name: m.name });
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec(m.sql);
        db.exec(`PRAGMA user_version = ${m.version}`);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        opts.log?.error('migrate: failed', { version: m.version, name: m.name });
        throw err;
      }
      applied.push(m.version);
    }
  } finally {
    if (fkWasOn) db.pragma('foreign_keys = ON');
  }

  const to = currentVersion(db);
  opts.log?.info('migrate: done', { from, to });
  return { from, to, applied };
}

export { LATEST_VERSION };
