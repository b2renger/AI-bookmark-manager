import type { Random } from '../../src/ports/index.js';

/** xoshiro128** seeded PRNG. Same seed → same byte stream → same ids, HLCs and fractional indices. */
export function seededRandom(seed: number): Random {
  let s0 = (seed ^ 0x9e3779b9) >>> 0 || 1;
  let s1 = (Math.imul(seed, 0x85ebca6b) ^ 0xc2b2ae35) >>> 0 || 2;
  let s2 = (Math.imul(seed, 0x27d4eb2f) ^ 0x165667b1) >>> 0 || 3;
  let s3 = (Math.imul(seed, 0x61c88647) ^ 0x1b873593) >>> 0 || 4;
  const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;
  const next = (): number => {
    const result = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9)) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result;
  };
  return {
    bytes: (n) => {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i += 4) {
        const v = next();
        out[i] = v & 0xff;
        if (i + 1 < n) out[i + 1] = (v >>> 8) & 0xff;
        if (i + 2 < n) out[i + 2] = (v >>> 16) & 0xff;
        if (i + 3 < n) out[i + 3] = (v >>> 24) & 0xff;
      }
      return out;
    },
    float: () => next() / 4294967296,
  };
}
