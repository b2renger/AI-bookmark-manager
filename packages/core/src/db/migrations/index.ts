import { sql as init } from './0001_init.js';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** Ordered, append-only. A shipped entry is never edited — fixes land as a new version.
 *  db/migrate.ts applies every entry whose version exceeds `PRAGMA user_version`. */
export const MIGRATIONS: Migration[] = [{ version: 1, name: 'init', sql: init }];

/** Highest version this build knows about. */
export const LATEST_VERSION: number = MIGRATIONS.reduce((m, x) => Math.max(m, x.version), 0);

export { FTS_TRIGGERS_SQL, FTS_TRIGGER_NAMES, LIBRARY_COLLECTION_ID } from './0001_init.js';
