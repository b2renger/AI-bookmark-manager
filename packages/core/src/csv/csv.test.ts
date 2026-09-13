import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv } from './parse.js';
import { applyMapping, inferMapping } from './mapping.js';

describe('parseCsv', () => {
  it('parses a plain comma file', () => {
    const r = parseCsv('a,b\n1,2\n3,4\n');
    expect(r.headers).toEqual(['a', 'b']);
    expect(r.rows).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }]);
    expect(r.delimiter).toBe(',');
  });

  it('handles quoted fields with commas, newlines and doubled quotes', () => {
    const text = 'title,note\n"Hello, world","line1\nline2"\n"He said ""hi""",plain\n';
    const r = parseCsv(text);
    expect(r.rows[0]).toEqual({ title: 'Hello, world', note: 'line1\nline2' });
    expect(r.rows[1]).toEqual({ title: 'He said "hi"', note: 'plain' });
  });

  it('handles CRLF line endings', () => {
    const r = parseCsv('a,b\r\n1,2\r\n3,4\r\n');
    expect(r.rows).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }]);
  });

  it('strips a UTF-8 BOM from the first header', () => {
    const r = parseCsv('﻿url,title\nhttps://example.com,X\n');
    expect(r.headers).toEqual(['url', 'title']);
    expect(r.rows[0]?.['url']).toBe('https://example.com');
  });

  it('auto-detects a semicolon delimiter', () => {
    const r = parseCsv('Lien;Titre\nhttps://a.example;A\nhttps://b.example;B\n');
    expect(r.delimiter).toBe(';');
    expect(r.headers).toEqual(['Lien', 'Titre']);
  });

  it('auto-detects a tab delimiter', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3\n')).toBe('\t');
  });

  it('does not mistake commas inside quotes for a delimiter', () => {
    const r = parseCsv('a;b\n"x,y";z\n');
    expect(r.delimiter).toBe(';');
    expect(r.rows[0]).toEqual({ a: 'x,y', b: 'z' });
  });

  it('tolerates ragged rows and a missing trailing newline', () => {
    const r = parseCsv('a,b,c\n1,2\n4,5,6,7');
    expect(r.rows[0]).toEqual({ a: '1', b: '2', c: '' });
    expect(r.rows[1]).toMatchObject({ a: '4', b: '5', c: '6', column_4: '7' });
  });

  it('skips blank lines', () => {
    expect(parseCsv('a,b\n1,2\n\n3,4\n').rows).toHaveLength(2);
  });
});

describe('inferMapping', () => {
  it('maps FR headers', () => {
    const headers = ['Lien', 'Titre', 'Étiquettes', 'Date'];
    const m = inferMapping(headers, [
      { Lien: 'https://example.com/a', Titre: 'A', 'Étiquettes': 'x,y', Date: '2024-03-12' },
    ]);
    expect(m['Lien']?.field).toBe('url');
    expect(m['Titre']?.field).toBe('title');
    expect(m['Étiquettes']?.field).toBe('tags');
    expect(m['Date']?.field).toBe('createdAt');
  });

  it('maps EN headers, including folder and description', () => {
    const m = inferMapping(['url', 'name', 'keywords', 'description', 'folder', 'added']);
    expect(m['url']?.field).toBe('url');
    expect(m['name']?.field).toBe('title');
    expect(m['keywords']?.field).toBe('tags');
    expect(m['description']?.field).toBe('summary');
    expect(m['folder']?.field).toBe('folderPath');
    expect(m['added']?.field).toBe('createdAt');
  });

  it('sniffs an unnamed URL column by its values', () => {
    const m = inferMapping(['col1', 'col2'], [
      { col1: 'Un titre', col2: 'https://example.com/a' },
      { col1: 'Un autre', col2: 'https://example.org/b' },
    ]);
    expect(m['col2']?.field).toBe('url');
  });

  it('sniffs a date column by its values', () => {
    const m = inferMapping(['lien', 'quand'], [
      { lien: 'https://example.com/a', quand: '2024-03-12T08:00:00Z' },
      { lien: 'https://example.com/b', quand: '2023-01-02T00:00:00Z' },
    ]);
    expect(m['quand']?.field).toBe('createdAt');
  });

  it('ignores what it cannot place', () => {
    const m = inferMapping(['url', 'zzz'], [{ url: 'https://example.com', zzz: 'blah' }]);
    expect(m['zzz']?.field).toBe('ignore');
  });
});

describe('applyMapping', () => {
  const mapping = inferMapping(['Lien', 'Titre', 'Étiquettes', 'Date', 'Dossier']);

  it('produces canonical drafts', () => {
    const { drafts, malformed } = applyMapping([{
      Lien: 'https://example.com/a', Titre: 'A', 'Étiquettes': 'x, y', Date: '2024-03-12',
      Dossier: 'Presse/Tech',
    }], mapping);
    expect(malformed).toHaveLength(0);
    expect(drafts[0]).toMatchObject({
      url: 'https://example.com/a',
      title: 'A',
      tags: ['x', 'y'],
      folderPath: ['Presse', 'Tech'],
      createdAt: '2024-03-12T00:00:00.000Z',
    });
  });

  it('reports rows without a valid URL instead of throwing', () => {
    const { drafts, malformed } = applyMapping([
      { Lien: 'https://ok.example.com', Titre: 'ok' },
      { Lien: 'pas-une-url', Titre: 'ko' },
      { Lien: '', Titre: 'vide' },
    ], mapping);
    expect(drafts).toHaveLength(1);
    expect(malformed).toHaveLength(2);
    expect(malformed[0]?.line).toBe(2);
    expect(malformed[1]?.reason).toMatch(/no url/);
  });

  it('parses unix seconds when the mapping says so', () => {
    const { drafts } = applyMapping(
      [{ url: 'https://example.com', t: '1700000000' }],
      { url: { field: 'url' }, t: { field: 'createdAt', dateFormat: 'unix-s' } },
    );
    expect(drafts[0]?.createdAt).toBe('2023-11-14T22:13:20.000Z');
  });
});
