import { beforeEach, describe, expect, it } from 'vitest';
import { _resetUuidState, isUuidv7, uuidTime, uuidv7 } from './uuid.js';
import { frozenClock } from '../../test/helpers/clock.js';
import { seededRandom } from '../../test/helpers/random.js';

describe('uuidv7', () => {
  beforeEach(() => _resetUuidState());

  it('produces valid v7 ids that sort by time', () => {
    const clock = frozenClock('2026-01-01T00:00:00.000Z');
    const rnd = seededRandom(1);
    const a = uuidv7(clock, rnd);
    clock.tick(5);
    const b = uuidv7(clock, rnd);
    expect(isUuidv7(a)).toBe(true);
    expect(isUuidv7(b)).toBe(true);
    expect(b > a).toBe(true);
    expect(uuidTime(b) - uuidTime(a)).toBe(5);
    expect(uuidTime(a)).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
  });

  it('is monotonic within one millisecond', () => {
    const clock = frozenClock('2026-01-01T00:00:00.000Z');
    const rnd = seededRandom(2);
    let prev = uuidv7(clock, rnd);
    for (let i = 0; i < 5000; i++) {
      const next = uuidv7(clock, rnd);
      expect(next > prev).toBe(true);
      prev = next;
    }
  });

  it('is deterministic under a frozen clock and seeded random', () => {
    const mk = () => {
      _resetUuidState();
      const clock = frozenClock('2026-01-01T00:00:00.000Z');
      const rnd = seededRandom(9);
      return [uuidv7(clock, rnd), uuidv7(clock, rnd)];
    };
    expect(mk()).toEqual(mk());
  });
});
