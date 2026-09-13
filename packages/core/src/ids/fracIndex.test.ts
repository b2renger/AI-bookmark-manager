import { describe, expect, it } from 'vitest';
import { generateKeyBetween, keyAfter, keyBefore, keyBetween } from './fracIndex.js';
import { seededRandom } from '../../test/helpers/random.js';

describe('fracIndex', () => {
  it('matches the reference algorithm on known cases', () => {
    expect(generateKeyBetween(null, null)).toBe('a0');
    expect(generateKeyBetween(null, 'a0')).toBe('Zz');
    expect(generateKeyBetween('a0', null)).toBe('a1');
    expect(generateKeyBetween('a0', 'a1')).toBe('a0V');
    expect(generateKeyBetween('a0V', 'a1')).toBe('a0l');
    expect(generateKeyBetween('Zz', 'a0')).toBe('ZzV');
    expect(generateKeyBetween('az', null)).toBe('b00');
  });

  it('appending at the end grows logarithmically, and ordering is strict in every direction', () => {
    const rnd = seededRandom(7);
    let a: string | null = null;
    const keys: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const k = keyAfter(a, rnd);
      if (a !== null) expect(k > a).toBe(true);
      keys.push(k);
      a = k;
    }
    expect(a!.length).toBeLessThan(12);

    let b: string | null = keys[0]!;
    for (let i = 0; i < 1000; i++) {
      const k = keyBefore(b, rnd);
      expect(k < b!).toBe(true);
      b = k;
    }
    expect(b!.length).toBeLessThan(12);

    let lo = keys[10]!;
    const hi = keys[11]!;
    for (let i = 0; i < 500; i++) {
      const k = keyBetween(lo, hi, rnd);
      expect(k > lo && k < hi).toBe(true);
      lo = k;
    }
    expect(lo.length).toBeLessThan(300);
  });

  it('never produces a key ending in 0 and rejects invalid input', () => {
    const rnd = seededRandom(1);
    for (let i = 0; i < 300; i++) {
      const k = keyBetween(i % 2 ? 'a1' : null, i % 3 ? 'a2' : null, rnd);
      expect(k.endsWith('0')).toBe(false);
    }
    expect(() => keyBetween('a2', 'a1', rnd)).toThrow();
    expect(() => keyBetween('a10', null, rnd)).toThrow();
    expect(() => keyBetween('', null, rnd)).toThrow();
    expect(() => keyBetween('A00000000000000000000000000', null, rnd)).toThrow();
  });

  it('is deterministic for a given seed and distinct for different seeds', () => {
    const k1 = keyBetween('a1', 'a2', seededRandom(42));
    const k2 = keyBetween('a1', 'a2', seededRandom(42));
    const k3 = keyBetween('a1', 'a2', seededRandom(43));
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
    expect(k1 > 'a1' && k1 < 'a2').toBe(true);
  });
});
