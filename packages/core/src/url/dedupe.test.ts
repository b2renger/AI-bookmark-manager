import { describe, expect, it } from 'vitest';
import { dedupe } from './dedupe.js';
import { normalizeUrl } from './normalize.js';

describe('dedupe', () => {
  it('collapses URLs that differ only by tracking params, case, slash or platform', () => {
    const items = [
      { url: 'https://example.com/a' },
      { url: 'https://example.com/a?utm_source=nl' },
      { url: 'https://EXAMPLE.com/a/' },
      { url: 'https://youtu.be/abc' },
      { url: 'https://www.youtube.com/watch?v=abc' },
      { url: 'https://example.com/b' },
    ];
    const r = dedupe(items);
    expect(r.unique.map((u) => u.url)).toEqual([
      'https://example.com/a', 'https://youtu.be/abc', 'https://example.com/b',
    ]);
    expect(r.duplicates).toHaveLength(3);
    expect(r.invalid).toHaveLength(0);
  });

  it('carries the norm onto each unique item', () => {
    const r = dedupe([{ url: 'https://example.com/a/?utm_medium=x' }]);
    expect(r.unique[0]?.norm).toBe('https://example.com/a');
    expect(r.unique[0]?.norm).toBe(normalizeUrl('https://example.com/a').norm);
  });

  it('respects norms already in the library', () => {
    const existing = [normalizeUrl('https://example.com/a').norm];
    const r = dedupe([{ url: 'https://example.com/a?utm_source=x' }, { url: 'https://example.com/c' }], existing);
    expect(r.unique.map((u) => u.url)).toEqual(['https://example.com/c']);
    expect(r.duplicates[0]?.existingNorm).toBe('https://example.com/a');
  });

  it('reports unparseable urls instead of throwing', () => {
    const r = dedupe([{ url: 'https://ok.example.com/' }, { url: '   ' }, { url: 'http://' }]);
    expect(r.unique).toHaveLength(1);
    expect(r.invalid).toHaveLength(2);
  });

  it('preserves the other fields of each item', () => {
    const r = dedupe([{ url: 'https://example.com/a', title: 'A', tags: ['x'] }]);
    expect(r.unique[0]).toMatchObject({ title: 'A', tags: ['x'] });
  });

  it('is a no-op on an empty input', () => {
    expect(dedupe([])).toEqual({ unique: [], duplicates: [], invalid: [] });
  });
});
