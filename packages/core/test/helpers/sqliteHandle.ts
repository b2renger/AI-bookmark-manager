import type BetterSqlite3 from 'better-sqlite3';
import type { DbHandle, SqlValue, Statement } from '../../src/ports/index.js';

/** The DbHandle port over better-sqlite3, for tests. The host has its own copy in
 *  apps/desktop/src/main/db/handle.ts — the duplication is deliberate: core must not depend on the
 *  test tree, and the host must not depend on it either. */
export class BetterSqliteHandle implements DbHandle {
  constructor(readonly raw: BetterSqlite3.Database) {}

  prepare(sql: string): Statement {
    const st = this.raw.prepare(sql);
    return {
      all: <T>(...p: SqlValue[]) => st.all(...p) as T[],
      get: <T>(...p: SqlValue[]) => st.get(...p) as T | undefined,
      run: (...p: SqlValue[]) => st.run(...p),
      iterate: <T>(...p: SqlValue[]) => st.iterate(...p) as IterableIterator<T>,
    };
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return this.raw.transaction(fn) as unknown as (...args: A) => R;
  }

  pragma(statement: string): unknown {
    return this.raw.pragma(statement);
  }
}
