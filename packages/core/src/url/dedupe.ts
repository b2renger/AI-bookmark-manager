import { normalizeUrl, type NormalizeOptions } from './normalize.js';

// plans/TECHNICAL-DESIGN.md §4.1 — the dedupe Set from legacy/App.tsx#handleProcessUrls, widened
// to report what collided with what instead of silently dropping.

export interface DedupeResult<T> {
  unique: (T & { norm: string })[];
  duplicates: { item: T; existingNorm: string }[];
  /** Items whose url could not be parsed at all. */
  invalid: { item: T; reason: string }[];
}

/**
 * Splits `items` against the norms already in the library AND against each other (first wins).
 * Pure: `existing` is any iterable of `url_norm` strings the caller read from the db.
 */
export function dedupe<T extends { url: string }>(
  items: T[],
  existing: Iterable<string> = [],
  opts?: NormalizeOptions,
): DedupeResult<T> {
  const seen = new Set<string>(existing);
  const unique: (T & { norm: string })[] = [];
  const duplicates: { item: T; existingNorm: string }[] = [];
  const invalid: { item: T; reason: string }[] = [];

  for (const item of items) {
    let norm: string;
    try {
      norm = normalizeUrl(item.url, opts).norm;
    } catch (e) {
      invalid.push({ item, reason: e instanceof Error ? e.message : String(e) });
      continue;
    }
    if (seen.has(norm)) {
      duplicates.push({ item, existingNorm: norm });
      continue;
    }
    seen.add(norm);
    unique.push({ ...item, norm });
  }
  return { unique, duplicates, invalid };
}
