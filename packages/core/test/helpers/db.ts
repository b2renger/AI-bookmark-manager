import { createRequire } from 'node:module';
import Database from 'better-sqlite3';
import type { DbHandle } from '../../src/ports/index.js';
import { applyConnectionPragmas } from '../../src/db/pragmas.js';
import { migrate } from '../../src/db/migrate.js';
import { ensureVecTables, vecAvailable } from '../../src/db/vec.js';
import { createHlc } from '../../src/ops/hlc.js';
import type { OpContext } from '../../src/ops/types.js';
import { frozenClock, type FrozenClock } from './clock.js';
import { seededRandom } from './random.js';
import { BetterSqliteHandle } from './sqliteHandle.js';

// plans/TECHNICAL-DESIGN.md §8.1. Frozen clock + seeded random ⇒ deterministic UUIDv7, HLC and
// fractional indices ⇒ snapshot-testable op logs.

const require = createRequire(import.meta.url);

export interface TestDbOptions {
  migrate?: boolean;
  vec?: boolean;
  seed?: number;
  startIso?: string;
  actorPubkey?: string;
}

export interface TestDb {
  db: DbHandle;
  raw: Database.Database;
  ctx: OpContext;
  clock: FrozenClock;
  /** True when sqlite-vec loaded and vec_docs exists. */
  vec: boolean;
  close(): void;
}

export function testDb(opts: TestDbOptions = {}): TestDb {
  const raw = new Database(':memory:');
  const db = new BetterSqliteHandle(raw);
  applyConnectionPragmas(db);

  let vec = false;
  if (opts.vec) {
    try {
      const sqliteVec = require('sqlite-vec') as { load(d: Database.Database): void };
      sqliteVec.load(raw);
      vec = vecAvailable(db);
    } catch {
      vec = false;
    }
  }

  if (opts.migrate !== false) migrate(db);
  if (vec) ensureVecTables(db, 256);

  const clock = frozenClock(opts.startIso ?? '2026-01-01T00:00:00.000Z');
  const random = seededRandom(opts.seed ?? 1);
  const actorPubkey = opts.actorPubkey ?? '';
  const ctx: OpContext = {
    db,
    clock,
    random,
    actorPubkey,
    hlc: createHlc(clock, actorPubkey),
    origin: 'local',
  };

  return { db, raw, ctx, clock, vec, close: () => raw.close() };
}
