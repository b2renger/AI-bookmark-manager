import type { DbHandle, Statement } from '../ports/index.js';

// applyOp re-`prepare`s five short statements per op by design (it is generic over the projector
// table). At 100k imports that is ~1.5 M compilations of a handful of distinct SQL strings, which
// is most of the import budget and none of the work. This decorator memoises `prepare` by SQL
// text; the statements themselves are stateless between calls, so reuse is safe.
//
// `iterate` is the exception: it hands back a live cursor, and a second `iterate` on the same
// compiled statement would reset the first. Those calls bypass the cache.

const DEFAULT_CAPACITY = 512;

export function withStatementCache(db: DbHandle, capacity = DEFAULT_CAPACITY): DbHandle {
  const cache = new Map<string, Statement>();

  return {
    prepare(sql: string): Statement {
      const hit = cache.get(sql);
      if (hit) return hit;
      const compiled = db.prepare(sql);
      const wrapped: Statement = {
        all: compiled.all.bind(compiled),
        get: compiled.get.bind(compiled),
        run: compiled.run.bind(compiled),
        // A fresh compilation per iteration: two open cursors must not share one statement.
        iterate: <T>(...params: Parameters<Statement['iterate']>) =>
          db.prepare(sql).iterate<T>(...params),
      };
      if (cache.size >= capacity) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(sql, wrapped);
      return wrapped;
    },
    exec: (sql: string) => db.exec(sql),
    transaction: <A extends unknown[], R>(fn: (...args: A) => R) => db.transaction(fn),
    pragma: (statement: string) => db.pragma(statement),
  };
}
