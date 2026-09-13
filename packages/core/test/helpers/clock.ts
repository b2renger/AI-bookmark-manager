import type { Clock } from '../../src/ports/index.js';

export interface FrozenClock extends Clock {
  tick(ms: number): void;
  set(iso: string): void;
}

/** A clock that only moves when told to. Deterministic UUIDv7 / HLC / timestamps in tests. */
export function frozenClock(startIso = '2026-01-01T00:00:00.000Z'): FrozenClock {
  let t = Date.parse(startIso);
  return {
    now: () => t,
    iso: () => new Date(t).toISOString(),
    tick: (ms) => {
      t += ms;
    },
    set: (iso) => {
      t = Date.parse(iso);
    },
  };
}
