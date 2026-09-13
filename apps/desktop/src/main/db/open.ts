import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import type { DbHandle, Logger } from '@cairn/core';
import {
  applyConnectionPragmas,
  currentVersion,
  ensureVecTables,
  LATEST_VERSION,
  migrate,
  vecAvailable,
} from '@cairn/core';
import { BetterSqliteHandle } from './handle.js';

// The host side of plans/TECHNICAL-DESIGN.md §3 / §3.9. Owns the file, the pre-upgrade backup and
// the optional sqlite-vec extension; every schema decision lives in @cairn/core.
// NOT wired into main/index.ts here — the integration step does that.

export const DB_FILENAME = 'library.db';
/** §3.3: the vec0 index is the 768-d BLOB truncated and renormalised to 256 dimensions. */
export const VEC_INDEX_DIM = 256;
const KEEP_BACKUPS = 3;

export interface VecStatus {
  available: boolean;
  error?: string;
}

export interface Library {
  db: DbHandle;
  raw: Database.Database;
  path: string;
  vec: VecStatus;
}

/** Keep the newest KEEP_BACKUPS `library.db.pre-<n>.bak` files, delete the rest. */
function pruneBackups(dir: string, log?: Logger): void {
  const backups = readdirSync(dir)
    .filter((f) => /^library\.db\.pre-\d+\.bak$/.test(f))
    .sort((a, b) => Number(/pre-(\d+)/.exec(a)![1]) - Number(/pre-(\d+)/.exec(b)![1]));
  for (const stale of backups.slice(0, Math.max(0, backups.length - KEEP_BACKUPS))) {
    try {
      rmSync(join(dir, stale));
    } catch (err) {
      log?.warn('db: could not remove an old backup', { file: stale, err: String(err) });
    }
  }
}

/** A consistent copy of the live database, taken before the first migration that raises
 *  user_version. `VACUUM INTO` rather than better-sqlite3's `backup()` because openLibrary is
 *  synchronous and `backup()` returns a promise; VACUUM INTO is a hot, transactional, WAL-safe
 *  copy that also drops free pages, which is exactly what a pre-upgrade snapshot wants. */
function snapshotBeforeUpgrade(raw: Database.Database, dir: string, from: number, log?: Logger): void {
  const target = join(dir, `${DB_FILENAME}.pre-${from}.bak`);
  try {
    if (existsSync(target)) rmSync(target);
    raw.prepare('VACUUM INTO ?').run(target);
    log?.info('db: pre-upgrade backup written', { target });
  } catch (err) {
    log?.warn('db: pre-upgrade backup failed, migrating anyway', { err: String(err) });
  }
  pruneBackups(dir, log);
}

export function openLibrary(userDataPath: string, log?: Logger): Library {
  mkdirSync(userDataPath, { recursive: true });
  const path = join(userDataPath, DB_FILENAME);

  const raw = new Database(path);
  const db = new BetterSqliteHandle(raw);
  applyConnectionPragmas(db);

  const from = currentVersion(db);
  if (from < LATEST_VERSION && existsSync(path)) {
    snapshotBeforeUpgrade(raw, userDataPath, from, log);
  }
  const opts = log === undefined ? {} : { log };
  migrate(db, opts);

  let vec: VecStatus = { available: false };
  try {
    sqliteVec.load(raw);
    if (!vecAvailable(db)) throw new Error('vec_version() unavailable after load');
    ensureVecTables(db, VEC_INDEX_DIM);
    vec = { available: true };
  } catch (err) {
    // Vectors are never lost to an index failure: the 768-d BLOB in `embeddings` is the truth.
    vec = { available: false, error: err instanceof Error ? err.message : String(err) };
    log?.warn('db: sqlite-vec unavailable, semantic search will fall back to FTS', {
      error: vec.error,
    });
  }

  log?.info('db: library open', { path, version: currentVersion(db), vec: vec.available });
  return { db, raw, path, vec };
}

export function closeLibrary(lib: Library, log?: Logger): void {
  try {
    lib.raw.pragma('optimize'); // bounded by analysis_limit = 400, see applyConnectionPragmas
  } catch (err) {
    log?.warn('db: PRAGMA optimize failed on close', { err: String(err) });
  }
  lib.raw.close();
}
