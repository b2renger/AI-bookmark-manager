import type { Clock } from '../../src/ports/index.js';
export interface FrozenClock extends Clock {
    tick(ms: number): void;
    set(iso: string): void;
}
/** A clock that only moves when told to. Deterministic UUIDv7 / HLC / timestamps in tests. */
export declare function frozenClock(startIso?: string): FrozenClock;
//# sourceMappingURL=clock.d.ts.map