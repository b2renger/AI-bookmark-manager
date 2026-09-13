import { describe, expect, it } from 'vitest';
import {
  EXPORT_SCHEMA, parseJsonl, slugify, writeJsonl, writeMarkdownVault, writeNetscape,
} from '../../src/exporters/index.js';
import type { BookmarkExportRow, ExportRecord, ExportSink } from '../../src/exporters/index.js';
import { importers } from '../../src/importers/index.js';
import type { BookmarkDraft } from '../../src/importers/index.js';
import { fixture } from '../importers/fixtures.js';

function memorySink(): ExportSink & { text(): string; closed: boolean } {
  const chunks: string[] = [];
  const sink = {
    closed: false,
    write: async (chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    },
    close: async () => {
      sink.closed = true;
    },
    text: () => chunks.join(''),
  };
  return sink;
}

const rows: BookmarkExportRow[] = [
  {
    id: 'b1', url: 'https://arxiv.org/abs/1706.03762', title: 'Attention Is All You Need',
    summary: 'Transformers.', note: 'À relire', tags: ['nlp', 'ml'],
    createdAt: '2023-04-12T08:30:00.000Z', folderPath: ['Veille', 'IA'],
  },
  {
    id: 'b2', url: 'https://excalidraw.com/', title: 'Excalidraw & co', tags: [],
    createdAt: '2024-01-02T09:15:00.000Z', folderPath: ['Outils'], platform: 'web',
  },
  { id: 'b3', url: 'https://example.net/plain', tags: ['divers'] },
];

describe('writeJsonl / parseJsonl', () => {
  const records: ExportRecord[] = [
    {
      t: 'header', $schema: EXPORT_SCHEMA, exportedAt: '2026-09-13T00:00:00.000Z',
      app: '0.1.0', dbVersion: 7, counts: { bookmarks: 2 },
    },
    { t: 'collection', v: { id: 'c1', name: 'Perso' } },
    {
      t: 'bookmark', v: { id: 'b1', url: 'https://a.example/' },
      versions: [], chunks: [], tags: [{ tagId: 't1', source: 'import' }],
    },
    { t: 'tag', v: { id: 't1', name: 'x' } },
    { t: 'op', v: { id: 'o1', hlc: '0000000000.0000.abcdefgh' } },
  ];

  it('writes one JSON object per line and closes the sink', async () => {
    const sink = memorySink();
    const res = await writeJsonl(records, sink);
    const lines = sink.text().trimEnd().split('\n');
    expect(lines).toHaveLength(5);
    expect(res.items).toBe(5);
    expect(res.bytes).toBe(sink.text().length);
    expect(sink.closed).toBe(true);
    expect(JSON.parse(lines[0]!)).toMatchObject({ $schema: 'cairn/export/1' });
  });

  it('accepts an async iterable', async () => {
    async function* gen(): AsyncGenerator<ExportRecord> {
      for (const r of records) yield r;
    }
    const sink = memorySink();
    const res = await writeJsonl(gen(), sink);
    expect(res.items).toBe(5);
  });

  it('round-trips through parseJsonl', async () => {
    const sink = memorySink();
    await writeJsonl(records, sink);
    const parsed = parseJsonl(sink.text());
    expect(parsed.header?.dbVersion).toBe(7);
    expect(parsed.records).toHaveLength(4);
    expect(parsed.records.map((r) => r.t)).toEqual(['collection', 'bookmark', 'tag', 'op']);
    expect(parsed.errors).toEqual([]);
  });

  it('tolerates a bad line and reports it', () => {
    const text = [
      JSON.stringify(records[0]),
      '{"t":"tag","v":{"id":"t1"}}',
      '{ this is not json',
      '42',
      '',
      JSON.stringify(records[4]),
    ].join('\n');
    const parsed = parseJsonl(text);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.errors).toHaveLength(2);
    expect(parsed.errors[0]?.line).toBe(3);
    expect(parsed.errors[1]?.reason).toBe('not an object');
  });
});

describe('writeNetscape', () => {
  it('nests folders and writes ADD_DATE / TAGS', async () => {
    const sink = memorySink();
    const res = await writeNetscape(rows, sink, { title: 'Cairn' });
    const html = sink.text();

    expect(res.items).toBe(3);
    expect(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true);
    expect(html).toContain('<H3>Veille</H3>');
    expect(html).toContain('<H3>IA</H3>');
    expect(html).toContain('ADD_DATE="1681288200"');
    expect(html).toContain('TAGS="nlp,ml"');
    expect(html).toContain('<DD>À relire');
    expect(html).toContain('Excalidraw &amp; co');
    expect((html.match(/<DL><p>/g) ?? []).length).toBe((html.match(/<\/DL><p>/g) ?? []).length);
    expect(sink.closed).toBe(true);
  });

  it('round-trips: fixture → drafts → netscape → drafts', async () => {
    const first = importers.netscape.parse({ kind: 'text', text: fixture('netscape-small.html') });
    const sink = memorySink();
    await writeNetscape(first.drafts.map(toRow), sink);
    const second = importers.netscape.parse({ kind: 'text', text: sink.text() });

    expect(second.drafts).toHaveLength(first.drafts.length);
    expect(key(second.drafts)).toEqual(key(first.drafts));
  });
});

function toRow(d: BookmarkDraft, i: number): BookmarkExportRow {
  const row: BookmarkExportRow = { id: `r${i}`, url: d.url, tags: d.tags ?? [] };
  if (d.title) row.title = d.title;
  if (d.note) row.note = d.note;
  if (d.createdAt) row.createdAt = d.createdAt;
  if (d.folderPath) row.folderPath = d.folderPath;
  return row;
}

/** URL + title + date + tags + folder, order-independent. */
function key(drafts: BookmarkDraft[]): string[] {
  return drafts
    .map((d) => [
      d.url, d.title ?? '', d.createdAt ?? '',
      (d.tags ?? []).join(','), (d.folderPath ?? []).join('/'),
    ].join('|'))
    .sort();
}

describe('writeMarkdownVault', () => {
  it('writes one note per bookmark plus an index', async () => {
    const files = new Map<string, ReturnType<typeof memorySink>>();
    const factory = (relPath: string) => {
      const sink = memorySink();
      files.set(relPath, sink);
      return sink;
    };
    const res = await writeMarkdownVault(rows, factory, { title: 'Ma veille' });

    expect(res.items).toBe(3);
    expect(res.files).toEqual([
      'Veille/IA/attention-is-all-you-need.md',
      'Outils/excalidraw-co.md',
      'example-net-plain.md',
      'index.md',
    ]);

    const note = files.get('Veille/IA/attention-is-all-you-need.md')!.text();
    expect(note.startsWith('---\n')).toBe(true);
    expect(note).toContain('url: "https://arxiv.org/abs/1706.03762"');
    expect(note).toContain('tags: ["nlp", "ml"]');
    expect(note).toContain('created: "2023-04-12T08:30:00.000Z"');
    expect(note).toContain('source: "cairn"');
    expect(note).toContain('# Attention Is All You Need');
    expect(note).toContain('## Notes');

    const index = files.get('index.md')!.text();
    expect(index).toContain('# Ma veille');
    expect(index).toContain('3 bookmarks.');
    expect(index).toContain('(Veille/IA/attention-is-all-you-need.md)');
    expect([...files.values()].every((s) => s.closed)).toBe(true);
  });

  it('disambiguates colliding slugs', async () => {
    const dup: BookmarkExportRow[] = [
      { id: 'a', url: 'https://a.example/1', title: 'Même titre', tags: [] },
      { id: 'b', url: 'https://a.example/2', title: 'Même titre', tags: [] },
    ];
    const res = await writeMarkdownVault(dup, () => memorySink());
    expect(res.files.slice(0, 2)).toEqual(['meme-titre.md', 'meme-titre-2.md']);
  });

  it('slugifies accents and punctuation', () => {
    expect(slugify('Café & Théière — n°1')).toBe('cafe-theiere-n-1');
    expect(slugify('!!!')).toBe('bookmark');
  });
});
