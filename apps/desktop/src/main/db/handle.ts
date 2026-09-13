import type BetterSqlite3 from 'better-sqlite3';
import type { DbHandle, SqlValue, Statement } from '@cairn/core';

/** The DbHandle port over better-sqlite3, for the main process. Deliberately a copy of
 *  packages/core/test/helpers/sqliteHandle.ts: core must not depend on the host, and the host must
 *  not depend on core's test tree. Twenty lines is cheaper than either coupling. */
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
