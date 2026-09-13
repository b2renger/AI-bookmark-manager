import { describe, expect, it } from 'vitest';
import {
  FIREFOX_QUERY_SQL, detectImporter, importers, parseFirefoxRows,
} from '../../src/importers/index.js';
import type { FirefoxRow } from '../../src/importers/firefox.js';
import { fixture } from './fixtures.js';

const text = (t: string) => ({ kind: 'text' as const, text: t });

describe('chrome importer', () => {
  const raw = fixture('chrome-Bookmarks.json');
  const r = importers.chrome.parse(text(raw));

  it('walks roots.bookmark_bar / other / synced', () => {
    expect(r.drafts.map((d) => d.url)).toEqual([
      'https://github.com/',
      'https://developer.mozilla.org/fr/',
      'https://doc.rust-lang.org/book/',
      'https://news.ycombinator.com/',
    ]);
  });

  it('turns the folder tree into folderPath[]', () => {
    expect(r.drafts[0]?.folderPath).toEqual(['Bookmarks bar']);
    expect(r.drafts[1]?.folderPath).toEqual(['Bookmarks bar', 'Dév']);
    expect(r.drafts[2]?.folderPath).toEqual(['Bookmarks bar', 'Dév', 'Langages']);
    expect(r.drafts[3]?.folderPath).toEqual(['Other bookmarks']);
  });

  it('converts the WebKit epoch to ISO', () => {
    // 13350000000000000 µs since 1601 → 13350000000000 ms − 11644473600000 ms
    expect(r.drafts[0]?.createdAt).toBe(new Date(13350000000000 - 11644473600000).toISOString());
    expect(r.drafts[0]?.createdAt).toBe('2024-01-17T21:20:00.000Z');
  });

  it('reports a node without a url instead of throwing', () => {
    expect(r.malformed).toHaveLength(1);
    expect(r.malformed[0]?.reason).toBe('node without url');
  });

  it('reports invalid JSON as malformed', () => {
    const bad = importers.chrome.parse(text('{"roots": '));
    expect(bad.drafts).toHaveLength(0);
    expect(bad.malformed[0]?.reason).toMatch(/invalid JSON/);
  });

  it('sniffs and wins detection', () => {
    expect(importers.chrome.sniff(text(raw))).toBe(1);
    expect(detectImporter(text(raw))[0]?.id).toBe('chrome');
  });
});

describe('firefox importer', () => {
  const rows: FirefoxRow[] = [
    { id: 11, parent: 3, title: 'Le Monde', url: 'https://www.lemonde.fr/', dateAdded: 1700000000000000, folderTitles: 'Presse/Quotidiens' },
    { id: 12, parent: 3, title: null, url: 'https://linuxfr.org/', dateAdded: 1690000000000000, folderTitles: '' },
    { id: 13, parent: 3, title: 'Cassé', url: '', dateAdded: null, folderTitles: null },
  ];

  it('maps rows to drafts with microsecond dates', () => {
    const r = parseFirefoxRows(rows);
    expect(r.drafts).toHaveLength(2);
    expect(r.drafts[0]).toMatchObject({
      url: 'https://www.lemonde.fr/',
      title: 'Le Monde',
      folderPath: ['Presse', 'Quotidiens'],
      createdAt: '2023-11-14T22:13:20.000Z',
    });
    expect(r.drafts[1]?.folderPath).toBeUndefined();
    expect(r.malformed).toHaveLength(1);
  });

  it('only accepts kind:"rows"', () => {
    expect(importers.firefox.sniff(text('anything'))).toBe(0);
    const wrong = importers.firefox.parse(text('anything'));
    expect(wrong.malformed[0]?.reason).toMatch(/kind:"rows"/);
  });

  it('exports the SQL the host runs over the copied places.sqlite', () => {
    expect(FIREFOX_QUERY_SQL).toMatch(/JOIN moz_places p ON b\.fk = p\.id/);
    expect(FIREFOX_QUERY_SQL).toMatch(/WITH RECURSIVE ancestry/);
    expect(FIREFOX_QUERY_SQL).toMatch(/b\.type = 1/);
  });
});

describe('raindrop importer', () => {
  const raw = fixture('raindrop.csv');
  const r = importers.raindrop.parse(text(raw));

  it('maps folder → folderPath, excerpt → summary, tags → tags', () => {
    expect(r.drafts).toHaveLength(4);
    expect(r.drafts[0]).toMatchObject({
      url: 'https://arxiv.org/abs/1706.03762',
      title: 'Attention Is All You Need',
      note: 'À relire',
      summary: 'Le papier qui a introduit les Transformers.',
      tags: ['transformers', 'nlp'],
      folderPath: ['Veille', 'IA'],
      createdAt: '2023-04-12T08:30:00.000Z',
    });
    expect(r.drafts[2]?.summary).toBe('Tableau blanc virtuel, "main levée"');
    expect(r.drafts[3]?.folderPath).toBeUndefined();
  });

  it('reports the row without a url', () => {
    expect(r.malformed).toHaveLength(1);
    expect(r.malformed[0]?.line).toBe(5);
  });

  it('sniffs on the excerpt+folder header', () => {
    expect(importers.raindrop.sniff(text(raw))).toBe(1);
    expect(detectImporter(text(raw))[0]?.id).toBe('raindrop');
  });
});

describe('karakeep importer', () => {
  const raw = fixture('karakeep.json');
  const r = importers.karakeep.parse(text(raw));

  it('maps tags, note+highlights and description → summary', () => {
    expect(r.drafts).toHaveLength(3);
    expect(r.drafts[0]).toMatchObject({
      url: 'https://www.inkandswitch.com/local-first/',
      title: 'Local-first software',
      summary: 'Seven ideals for local-first software.',
      tags: ['local-first', 'crdt'],
      author: 'Ink & Switch',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(r.drafts[0]?.note).toContain('You own your data');
    expect(r.drafts[1]?.title).toBe('Write-Ahead Logging');
    expect(r.drafts[1]?.tags).toEqual(['sqlite', 'perf']);
  });

  it('skips a non-link item and says why', () => {
    expect(r.malformed).toHaveLength(1);
    expect(r.malformed[0]?.reason).toMatch(/unsupported content type: text/);
  });

  it('accepts a top-level array too', () => {
    const arr = importers.karakeep.parse(text(JSON.stringify([
      { createdAt: 1700000000, content: { type: 'link', url: 'https://a.example/' } },
    ])));
    expect(arr.drafts).toHaveLength(1);
  });

  it('sniffs the content.type = link shape', () => {
    expect(importers.karakeep.sniff(text(raw))).toBe(1);
    expect(detectImporter(text(raw))[0]?.id).toBe('karakeep');
  });
});

describe('pocket importer', () => {
  const raw = fixture('pocket.csv');
  const r = importers.pocket.parse(text(raw));

  it('maps time_added, pipe-separated tags and keeps status in extra', () => {
    expect(r.drafts).toHaveLength(4);
    expect(r.drafts[0]).toMatchObject({
      url: 'https://grugbrain.dev/',
      title: 'The Grug Brained Developer',
      tags: ['dev', 'humour'],
      createdAt: '2023-01-01T00:00:00.000Z',
      extra: { status: 'unread' },
    });
    expect(r.drafts[1]?.extra).toEqual({ status: 'archive' });
    expect(r.drafts[2]?.tags).toBeUndefined();
    expect(r.drafts[3]?.title).toBe('Titre, avec "guillemets"');
  });

  it('reports the row without a url', () => {
    expect(r.malformed).toHaveLength(1);
    expect(r.malformed[0]?.line).toBe(4);
  });

  it('sniffs on time_added + status', () => {
    expect(importers.pocket.sniff(text(raw))).toBe(1);
    expect(detectImporter(text(raw))[0]?.id).toBe('pocket');
  });
});

describe('generic csv importer', () => {
  const raw = fixture('generic-semicolon.csv');
  const r = importers.csv.parse(text(raw));

  it('auto-detects `;` and infers the FR mapping', () => {
    expect(r.drafts).toHaveLength(4);
    expect(r.drafts[0]).toMatchObject({
      url: 'https://www.lemonde.fr/pixels/',
      title: 'Le Monde Pixels',
      tags: ['presse', 'tech'],
      folderPath: ['Presse', 'Tech'],
      createdAt: '2024-03-12T00:00:00.000Z',
    });
  });

  it('reports the malformed row rather than throwing', () => {
    expect(r.malformed).toHaveLength(1);
    expect(r.malformed[0]?.line).toBe(4);
    expect(r.malformed[0]?.reason).toMatch(/not a URL/);
  });

  it('accepts a caller-supplied mapping', () => {
    const forced = importers.csv.parse(text(raw), {
      mapping: { Lien: { field: 'url' }, Titre: { field: 'note' } },
    });
    expect(forced.drafts[0]?.note).toBe('Le Monde Pixels');
    expect(forced.drafts[0]?.title).toBeUndefined();
  });

  it('accepts kind:"rows" straight from the host', () => {
    const rows = importers.csv.parse({
      kind: 'rows',
      rows: [{ url: 'https://a.example/', title: 'A' }],
    });
    expect(rows.drafts[0]).toMatchObject({ url: 'https://a.example/', title: 'A' });
  });

  it('sniffs below the dedicated adapters', () => {
    const confidence = importers.csv.sniff(text(raw));
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThan(importers.pocket.sniff(text(fixture('pocket.csv'))));
  });
});

describe('detectImporter', () => {
  it('sorts candidates by confidence and drops the zeros', () => {
    const list = detectImporter(text(fixture('netscape-small.html')));
    expect(list[0]).toEqual({ id: 'netscape', confidence: 1 });
    expect(list.every((c) => c.confidence > 0)).toBe(true);
    expect(list.map((c) => c.id)).not.toContain('notion');
  });

  it('returns nothing for empty input', () => {
    expect(detectImporter(text('   '))).toEqual([]);
  });
});
