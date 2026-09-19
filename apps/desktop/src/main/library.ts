import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { withStatementCache, type DbHandle, type OpContext } from '@cairn/core';
import { closeLibrary, openLibrary, DB_FILENAME, type Library } from './db/open.js';
import { createOpContext } from './context.js';
import { log } from './logger.js';

// Module-level library handle. `index.ts` opens it once on `whenReady` and closes it on
// `before-quit`; every IPC handler reads it through `library()` and fails loudly if it is not open
// rather than silently querying a closed database.

export interface OpenLibrary {
  lib: Library;
  db: DbHandle;
  ctx: OpContext;
  path: string;
}

let current: OpenLibrary | null = null;

/** The e2e leg and the rig seed a library by pointing CAIRN_FIXTURE at a .db file; it is copied
 *  in only when the user data directory has no database yet, so a real profile is never clobbered. */
function seedFromFixture(userDataPath: string): void {
  const fixture = process.env['CAIRN_FIXTURE'];
  if (!fixture) return;
  const target = join(userDataPath, DB_FILENAME);
  if (existsSync(target)) {
    log.info('library: CAIRN_FIXTURE ignored, a database already exists', { target });
    return;
  }
  if (!existsSync(fixture)) {
    log.warn('library: CAIRN_FIXTURE does not exist', { fixture });
    return;
  }
  copyFileSync(fixture, target);
  log.info('library: seeded from CAIRN_FIXTURE', { fixture, target });
}

export function openLibraryFor(userDataPath: string): OpenLibrary {
  if (current) return current;
  seedFromFixture(userDataPath);
  const lib = openLibrary(userDataPath, log);
  // applyOp re-prepares a handful of short statements per op; memoising them is what keeps a
  // 100k import inside its budget. See packages/core/src/library/cachedDb.ts.
  const db = withStatementCache(lib.db);
  current = { lib, db, ctx: createOpContext(db), path: lib.path };
  return current;
}

export function library(): OpenLibrary {
  if (!current) throw new Error('library: not open yet');
  return current;
}

export function libraryPath(userDataPath: string): string {
  return current?.path ?? join(userDataPath, DB_FILENAME);
}

export function closeLibraryHandle(): void {
  if (!current) return;
  closeLibrary(current.lib, log);
  current = null;
}
