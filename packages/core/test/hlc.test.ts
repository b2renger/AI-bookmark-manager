import { describe, expect, it } from 'vitest';
import { HLC_LENGTH, actorShortId, compareHlc, createHlc, isHlc, parseHlc } from '../src/ops/hlc.js';
import { Hlc } from '../src/db/schema.js';
import { frozenClock } from './helpers/clock.js';
import { seededRandom } from './helpers/random.js';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

describe('hlc', () => {
  it('formats a fixed-width string that passes the schema regex', () => {
    const g = createHlc(frozenClock(), 'z7pKq3nW2abcdefgh');
    const h = g.next();
    expect(h).toHaveLength(HLC_LENGTH);
    expect(HLC_LENGTH).toBe(24); // 10 + '.' + 4 + '.' + 8; §3.5's "29" is a typo
    expect(isHlc(h)).toBe(true);
    expect(Hlc.safeParse(h).success).toBe(true);
    expect(parseHlc(h).actor).toBe('z7pKq3nW');
  });

  it('derives a stable placeholder actor for the empty pubkey', () => {
    const a = actorShortId('');
    const b = actorShortId('');
    expect(a).toBe(b);
    expect(a).toHaveLength(8);
    expect([...a].every((c) => B58.includes(c))).toBe(true);
    expect(actorShortId('')).not.toBe(actorShortId('other'));
  });

  it('is strictly monotonic under a frozen clock', () => {
    const g = createHlc(frozenClock(), '');
    let prev = g.next();
    for (let i = 0; i < 5000; i++) {
      const next = g.next();
      expect(next > prev).toBe(true);
      prev = next;
    }
    expect(parseHlc(prev).counter).toBe(5000);
  });

  it('resets the counter when the wall clock advances', () => {
    const clock = frozenClock();
    const g = createHlc(clock, '');
    g.next();
    g.next();
    expect(parseHlc(g.next()).counter).toBe(2);
    clock.tick(1);
    expect(parseHlc(g.next()).counter).toBe(0);
  });

  it('receive() advances past a remote HLC', () => {
    const clock = frozenClock('2026-01-01T00:00:00.000Z');
    const g = createHlc(clock, '');
    const local = g.next();
    const remote = createHlc(frozenClock('2026-06-01T00:00:00.000Z'), 'Zremotepubkey58').next();
    expect(remote > local).toBe(true);

    g.receive(remote);
    const after = g.next();
    expect(after > remote).toBe(true);
    expect(parseHlc(after).physical).toBe(Date.parse('2026-06-01T00:00:00.000Z'));
    expect(g.last()).toBe(after);
  });

  it('receive() of a tied physical bumps the counter past the remote one', () => {
    const clock = frozenClock();
    const g = createHlc(clock, '');
    const remoteGen = createHlc(frozenClock(), 'Zremotepubkey58');
    remoteGen.next();
    remoteGen.next();
    const remote = remoteGen.next(); // counter 2, same millisecond
    g.next(); // counter 0
    g.receive(remote);
    expect(parseHlc(g.next()).counter).toBe(4); // receive → 3, next → 4
  });

  it('receive() of an older remote never moves the clock backwards', () => {
    const clock = frozenClock('2026-06-01T00:00:00.000Z');
    const g = createHlc(clock, '');
    const mine = g.next();
    const old = createHlc(frozenClock('2020-01-01T00:00:00.000Z'), 'Zremotepubkey58').next();
    g.receive(old);
    const after = g.next();
    expect(after > mine).toBe(true);
    expect(parseHlc(after).physical).toBe(Date.parse('2026-06-01T00:00:00.000Z'));
  });

  it('string order equals logical order for 10k random pairs', () => {
    const rnd = seededRandom(11);
    const mk = (): { s: string; key: [number, number, string] } => {
      const physical = Math.floor(rnd.float() * 2_000_000_000_000);
      const counter = Math.floor(rnd.float() * 1000);
      const actor = Array.from({ length: 8 }, () => B58[Math.floor(rnd.float() * 58)]!).join('');
      const s =
        physical.toString(36).padStart(10, '0') +
        '.' +
        counter.toString(36).padStart(4, '0') +
        '.' +
        actor;
      return { s, key: [physical, counter, actor] };
    };
    const cmpKey = (a: [number, number, string], b: [number, number, string]): number =>
      a[0] !== b[0] ? Math.sign(a[0] - b[0]) : a[1] !== b[1] ? Math.sign(a[1] - b[1]) : a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0;

    for (let i = 0; i < 10_000; i++) {
      const a = mk();
      const b = mk();
      expect(isHlc(a.s)).toBe(true);
      expect(compareHlc(a.s, b.s)).toBe(cmpKey(a.key, b.key));
    }
  });

  it('rejects malformed strings', () => {
    expect(() => parseHlc('nope')).toThrow();
    expect(isHlc('0m3k9tz7q1.001f.7pKq3nW')).toBe(false);
    expect(isHlc('0m3k9tz7q1.001f.7pKq3nW2')).toBe(true);
  });
});
