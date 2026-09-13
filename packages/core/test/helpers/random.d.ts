import type { Random } from '../../src/ports/index.js';
/** xoshiro128** seeded PRNG. Same seed → same byte stream → same ids, HLCs and fractional indices. */
export declare function seededRandom(seed: number): Random;
//# sourceMappingURL=random.d.ts.map