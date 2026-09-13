import type { Random } from '../ports/index.js';

// Synthetic embeddings (plans/TECHNICAL-DESIGN.md §8.2): 400 topic centroids uniform on the
// 768-sphere, each document = normalise(centroid + σ·gauss()) with σ ∈ [0.25, 0.55] per topic,
// plus 3 % uniform-noise points. No model, no download, and Louvain still recovers ≈ 400
// communities. Everything below draws from the injected Random only.

export const FIXTURE_MODEL_ID = 'fixture-synthetic-768';
export const FIXTURE_DIM = 768;
/** The truncated dimension pushed into sqlite-vec; the real truncator lands in P1. */
export const FIXTURE_VEC_DIM = 256;
export const NOISE_FRACTION = 0.03;
export const SIGMA_MIN = 0.25;
export const SIGMA_MAX = 0.55;

/** Box–Muller over random.float(), with the second variate cached. */
export class Gaussian {
  private spare: number | null = null;
  private readonly random: Random;

  constructor(random: Random) {
    this.random = random;
  }

  next(): number {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s;
    }
    let u = this.random.float();
    if (u < 1e-12) u = 1e-12;
    const v = this.random.float();
    const r = Math.sqrt(-2 * Math.log(u));
    const theta = 2 * Math.PI * v;
    this.spare = r * Math.sin(theta);
    return r * Math.cos(theta);
  }
}

export function normalise(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!;
  const n = Math.sqrt(sum) || 1;
  for (let i = 0; i < v.length; i++) v[i] = v[i]! / n;
  return v;
}

/** A point uniform on the unit sphere: normalised isotropic gaussian. */
export function unitVector(g: Gaussian, dim: number): Float32Array {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = g.next();
  return normalise(v);
}

export interface TopicGeometry {
  centroids: Float32Array[];
  /** σ per topic, uniform in [SIGMA_MIN, SIGMA_MAX]. */
  sigmas: Float64Array;
}

export function buildTopicGeometry(random: Random, topics: number, dim = FIXTURE_DIM): TopicGeometry {
  const g = new Gaussian(random);
  const centroids: Float32Array[] = [];
  const sigmas = new Float64Array(topics);
  for (let t = 0; t < topics; t++) {
    centroids.push(unitVector(g, dim));
    sigmas[t] = SIGMA_MIN + random.float() * (SIGMA_MAX - SIGMA_MIN);
  }
  return { centroids, sigmas };
}

/** normalise(centroid + σ·gauss()). */
export function docVector(centroid: Float32Array, sigma: number, g: Gaussian): Float32Array {
  const v = new Float32Array(centroid.length);
  for (let i = 0; i < centroid.length; i++) v[i] = centroid[i]! + sigma * g.next();
  return normalise(v);
}

/** Truncate to `dim` leading components and re-normalise. Placeholder for the P1 Matryoshka
 *  truncator; keeping it here means fixture/ has no dependency on code that does not exist yet. */
export function truncateRenormalise(v: Float32Array, dim: number): Float32Array {
  return normalise(v.slice(0, dim));
}

/** Float32 little-endian BLOB, the on-disk form of `embeddings.vec`. */
export function toFloat32LeBlob(v: Float32Array): Uint8Array {
  const bytes = new Uint8Array(v.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < v.length; i++) view.setFloat32(i * 4, v[i]!, true);
  return bytes;
}

export function fromFloat32LeBlob(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length / 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

export function norm(v: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!;
  return Math.sqrt(sum);
}
