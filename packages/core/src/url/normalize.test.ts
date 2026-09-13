import { describe, expect, it } from 'vitest';
import {
  InvalidUrlError, isProbablyUrl, normalizeUrl, registrableDomain,
} from './normalize.js';

const norm = (s: string): string => normalizeUrl(s).norm;

describe('normalizeUrl', () => {
  // plans/p0-foundation.md task 10 asks for 20 cases: UTM, fragment, trailing slash, punycode…
  const cases: [name: string, input: string, expected: string][] = [
    ['strips utm_*', 'https://example.com/a?utm_source=nl&utm_medium=email&id=7', 'https://example.com/a?id=7'],
    ['strips fbclid/gclid', 'https://example.com/a?fbclid=abc&gclid=def', 'https://example.com/a'],
    ['strips the long tracking tail', 'https://example.com/a?igshid=1&mc_eid=2&spm=3&si=4&yclid=5&_hsenc=6&mkt_tok=7&ref_src=8', 'https://example.com/a'],
    ['keeps real query params', 'https://example.com/s?q=caf%C3%A9&page=2', 'https://example.com/s?page=2&q=caf%C3%A9'],
    ['sorts the query', 'https://example.com/a?z=1&a=2&m=3', 'https://example.com/a?a=2&m=3&z=1'],
    ['drops a plain fragment', 'https://example.com/doc#section-3', 'https://example.com/doc'],
    ['keeps a #!/ SPA route', 'https://app.example.com/#!/boards/7', 'https://app.example.com/#!/boards/7'],
    ['keeps a #/ SPA route', 'https://app.example.com/#/settings', 'https://app.example.com/#/settings'],
    ['drops a trailing slash', 'https://example.com/blog/post/', 'https://example.com/blog/post'],
    ['keeps the root slash', 'https://example.com/', 'https://example.com/'],
    ['lowercases scheme and host', 'HTTPS://EXAMPLE.COM/Path', 'https://example.com/Path'],
    ['keeps path case', 'https://example.com/CaseSensitive', 'https://example.com/CaseSensitive'],
    ['drops the default https port', 'https://example.com:443/a', 'https://example.com/a'],
    ['drops the default http port', 'http://example.com:80/a', 'http://example.com/a'],
    ['keeps a non-default port', 'https://example.com:8443/a', 'https://example.com:8443/a'],
    ['punycodes an IDN host', 'https://CAFÉ.example.com/menu', 'https://xn--caf-dma.example.com/menu'],
    ['punycodes an IDN TLD', 'https://bücher.de/', 'https://xn--bcher-kva.de/'],
    ['youtu.be → youtube.com/watch', 'https://youtu.be/dQw4w9WgXcQ', 'https://youtube.com/watch?v=dQw4w9WgXcQ'],
    ['youtu.be keeps other params', 'https://youtu.be/abc123?t=42', 'https://youtube.com/watch?t=42&v=abc123'],
    ['www.youtube.com → youtube.com', 'https://www.youtube.com/watch?v=abc', 'https://youtube.com/watch?v=abc'],
    ['m.youtube.com → youtube.com', 'https://m.youtube.com/watch?v=abc', 'https://youtube.com/watch?v=abc'],
    ['x.com → twitter.com', 'https://x.com/jack/status/20', 'https://twitter.com/jack/status/20'],
    ['mobile.twitter.com → twitter.com', 'https://mobile.twitter.com/jack', 'https://twitter.com/jack'],
    ['fr.m.wikipedia.org → fr.wikipedia.org', 'https://fr.m.wikipedia.org/wiki/Signet', 'https://fr.wikipedia.org/wiki/Signet'],
    ['bare host gets https', 'example.com/a', 'https://example.com/a'],
    ['keeps www by default', 'https://www.example.com/a', 'https://www.example.com/a'],
    ['trims surrounding whitespace', '   https://example.com/a   ', 'https://example.com/a'],
  ];

  for (const [name, input, expected] of cases) {
    it(name, () => {
      expect(norm(input)).toBe(expected);
    });
  }

  it('only strips www when asked', () => {
    expect(normalizeUrl('https://www.example.com/a', { stripWww: true }).norm)
      .toBe('https://example.com/a');
  });

  it('keeps tracking params when stripTracking is off', () => {
    expect(normalizeUrl('https://example.com/a?utm_source=x', { stripTracking: false }).norm)
      .toBe('https://example.com/a?utm_source=x');
  });

  it('keeps the fragment when stripFragment is off', () => {
    expect(normalizeUrl('https://example.com/a#top', { stripFragment: false }).norm)
      .toBe('https://example.com/a#top');
  });

  it('skips platform rewrites when canonicalPlatform is off', () => {
    expect(normalizeUrl('https://x.com/jack', { canonicalPlatform: false }).norm)
      .toBe('https://x.com/jack');
  });

  it('keeps the original url beside the normalised one', () => {
    const r = normalizeUrl('https://youtu.be/dQw4w9WgXcQ?utm_source=nl');
    expect(r.url).toBe('https://youtu.be/dQw4w9WgXcQ?utm_source=nl');
    expect(r.norm).toBe('https://youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('hashes the normalised form to 32 hex chars, stably', () => {
    const a = normalizeUrl('https://example.com/a?utm_source=nl');
    const b = normalizeUrl('https://example.com/a/');
    expect(a.hash).toMatch(/^[0-9a-f]{32}$/);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).not.toBe(normalizeUrl('https://example.com/b').hash);
  });

  it('reports host and registrable domain', () => {
    const r = normalizeUrl('https://blog.sub.example.co.uk/a');
    expect(r.host).toBe('blog.sub.example.co.uk');
    expect(r.registrable).toBe('example.co.uk');
  });

  it('leaves non-web schemes alone apart from the fragment', () => {
    expect(norm('mailto:a@example.com')).toBe('mailto:a@example.com');
  });

  it('throws InvalidUrlError on junk', () => {
    expect(() => normalizeUrl('   ')).toThrow(InvalidUrlError);
    expect(() => normalizeUrl('http://')).toThrow(InvalidUrlError);
  });
});

describe('registrableDomain', () => {
  it('takes the last two labels', () => {
    expect(registrableDomain('a.b.example.com')).toBe('example.com');
  });
  it('takes three under a known second-level suffix', () => {
    expect(registrableDomain('www.bbc.co.uk')).toBe('bbc.co.uk');
    expect(registrableDomain('shop.example.com.au')).toBe('example.com.au');
  });
  it('leaves a bare host and an IPv4 alone', () => {
    expect(registrableDomain('localhost')).toBe('localhost');
    expect(registrableDomain('192.168.1.10')).toBe('192.168.1.10');
  });
});

describe('isProbablyUrl', () => {
  it('accepts obvious URLs and bare hosts', () => {
    expect(isProbablyUrl('https://example.com')).toBe(true);
    expect(isProbablyUrl('example.com/a')).toBe(true);
    expect(isProbablyUrl('http://localhost:3000/x')).toBe(true);
  });
  it('rejects prose, empty strings and bare words', () => {
    expect(isProbablyUrl('')).toBe(false);
    expect(isProbablyUrl('pas une url')).toBe(false);
    expect(isProbablyUrl('unread')).toBe(false);
    expect(isProbablyUrl('2024-01-01')).toBe(false);
  });
});
