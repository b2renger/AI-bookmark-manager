import { describe, expect, it } from 'vitest';
import { importers, detectImporter, parseNetscapeLines } from '../../src/importers/index.js';
import { generateNetscape } from '../helpers/netscapeGen.js';
import { fixture } from './fixtures.js';

const html = fixture('netscape-small.html');
const parse = (text: string) => importers.netscape.parse({ kind: 'text', text });

describe('netscape importer — DOM path', () => {
  const result = parse(html);

  it('finds every anchor, duplicates included (dedupe is a later stage)', () => {
    expect(result.drafts).toHaveLength(6);
    expect(result.drafts.filter((d) => d.url === 'https://example.com/root-link')).toHaveLength(2);
  });

  it('turns nested <H3> into folderPath[]', () => {
    const byUrl = new Map(result.drafts.map((d) => [d.url, d]));
    // The root anchor comes first; the duplicate deeper in the tree is the last draft.
    expect(result.drafts[0]?.url).toBe('https://example.com/root-link');
    expect(result.drafts[0]?.folderPath).toBeUndefined();
    expect(byUrl.get('https://arxiv.org/abs/2301.00001')?.folderPath).toEqual(['Lecture']);
    expect(byUrl.get('https://youtu.be/dQw4w9WgXcQ')?.folderPath).toEqual(['Lecture', 'Vidéos']);
    expect(byUrl.get('https://fr.m.wikipedia.org/wiki/Signet')?.folderPath).toEqual(['Outils']);
    expect(result.drafts.at(-2)?.folderPath).toEqual(['Lecture', 'Vidéos', 'Archives']);
  });

  it('converts ADD_DATE (unix seconds) to ISO', () => {
    const d = result.drafts.find((x) => x.url === 'https://arxiv.org/abs/2301.00001');
    expect(d?.createdAt).toBe(new Date(1690000001 * 1000).toISOString());
    expect(result.detected.dateRange?.[0]).toBe(new Date(1690000001 * 1000).toISOString());
  });

  it('reads TAGS, <DD> notes and accented titles', () => {
    const d = result.drafts.find((x) => x.url === 'https://arxiv.org/abs/2301.00001');
    expect(d?.tags).toEqual(['papier', 'ml']);
    expect(d?.title).toBe('Un papier très intéressant');
    expect(d?.note).toBe('Note sur le papier, avec des accents : é à ù.');
    // The <DD> belongs to the anchor it follows, not to the next one.
    expect(result.drafts.find((x) => x.url.startsWith('https://blog.example.org'))?.note)
      .toBeUndefined();
  });

  it('decodes HTML entities in hrefs and titles', () => {
    const d = result.drafts.find((x) => x.url.startsWith('https://blog.example.org'));
    expect(d?.url).toBe('https://blog.example.org/post?utm_source=newsletter&id=7');
    expect(d?.title).toBe('Article & co');
  });

  it('summarises folders, tags and the date range', () => {
    expect(result.detected.folders).toBe(4);
    expect(result.detected.tags).toEqual(new Set(['papier', 'ml', 'video', 'ref', 'wiki']).size);
    expect(result.detected.sourceLabel).toBe('Netscape bookmarks (HTML)');
    expect(result.malformed).toEqual([]);
  });

  it('sniffs at full confidence and wins detection', () => {
    expect(importers.netscape.sniff({ kind: 'text', text: html })).toBe(1);
    expect(detectImporter({ kind: 'text', text: html })[0]?.id).toBe('netscape');
  });
});

describe('netscape importer — pasted-lines path (legacy UrlInput regexes)', () => {
  it('parses a pasted fragment with ADD_DATE', () => {
    const r = parseNetscapeLines(
      '<DT><A HREF="https://a.example/1" ADD_DATE="1700000000">Un</A>\n' +
      '<DT><A HREF="https://b.example/2">Deux</A>\n' +
      '<H1>Bookmarks</H1>\n',
    );
    expect(r.drafts).toHaveLength(2);
    expect(r.drafts[0]).toMatchObject({
      url: 'https://a.example/1', title: 'Un', createdAt: '2023-11-14T22:13:20.000Z',
    });
    expect(r.drafts[0]?.folderPath).toBeUndefined();
  });

  it('strips numbered and bullet list prefixes from a plain URL list', () => {
    const r = parseNetscapeLines('1. https://a.example\n- https://b.example\n* https://c.example\n');
    expect(r.drafts.map((d) => d.url)).toEqual([
      'https://a.example', 'https://b.example', 'https://c.example',
    ]);
  });

  it('reports non-URL lines instead of throwing', () => {
    const r = parseNetscapeLines('https://a.example\nceci n’est pas une url\n');
    expect(r.drafts).toHaveLength(1);
    expect(r.malformed).toHaveLength(1);
    expect(r.malformed[0]?.line).toBe(2);
  });

  it('is what `parse` picks when there is no <DL>', () => {
    const r = parse('https://a.example\nhttps://b.example\n');
    expect(r.drafts).toHaveLength(2);
    expect(r.detected.sourceLabel).toBe('Pasted links');
  });
});

describe('netscape importer — 5,000 entries', () => {
  it('parses a generated 5k file in under 1.5 s with matching counts', () => {
    const gen = generateNetscape(5000, 20260913);
    const started = performance.now();
    const r = parse(gen.html);
    const elapsed = performance.now() - started;

    expect(r.drafts).toHaveLength(gen.count);
    expect(r.malformed).toEqual([]);
    expect(new Set(r.drafts.map((d) => d.url))).toEqual(new Set(gen.urls));
    expect(r.detected.folders).toBeGreaterThan(5);
    expect(elapsed).toBeLessThan(1500);
  });

  it('is deterministic for a given seed', () => {
    expect(generateNetscape(50, 7).html).toBe(generateNetscape(50, 7).html);
  });
});
