import { describe, expect, it } from 'vitest';
import {
  inferNotionMapping, notionPagesToRows, notionPropToString, notionToDrafts,
} from '../../src/importers/notion.js';
import type { NotionPage } from '../../src/importers/notion.js';

const pages: NotionPage[] = [
  {
    id: 'page-1',
    created_time: '2024-02-01T10:00:00.000Z',
    properties: {
      Name: { type: 'title', title: [{ plain_text: 'Local-first' }] },
      URL: { type: 'url', url: 'https://www.inkandswitch.com/local-first/' },
      Description: { type: 'rich_text', rich_text: [{ plain_text: 'Sept idéaux.' }] },
      Keywords: { type: 'multi_select', multi_select: [{ name: 'crdt' }, { name: 'sync' }] },
      Date: { type: 'date', date: { start: '2024-02-01' } },
      Done: { type: 'checkbox', checkbox: true },
    },
  },
  {
    id: 'page-2',
    created_time: '2024-03-01T10:00:00.000Z',
    properties: {
      Name: { type: 'title', title: [{ plain_text: 'Sans lien' }] },
      URL: { type: 'url', url: null },
      Description: { type: 'rich_text', rich_text: [] },
      Keywords: { type: 'multi_select', multi_select: [] },
      Date: { type: 'date', date: null },
      Done: { type: 'checkbox', checkbox: false },
    },
  },
];

describe('notionPropToString', () => {
  it('flattens every property type we support', () => {
    expect(notionPropToString({ type: 'title', title: [{ plain_text: 'A' }, { plain_text: 'B' }] })).toBe('AB');
    expect(notionPropToString({ type: 'url', url: 'https://a.example' })).toBe('https://a.example');
    expect(notionPropToString({ type: 'multi_select', multi_select: [{ name: 'x' }, { name: 'y' }] })).toBe('x,y');
    expect(notionPropToString({ type: 'select', select: { name: 'z' } })).toBe('z');
    expect(notionPropToString({ type: 'date', date: { start: '2024-01-01' } })).toBe('2024-01-01');
    expect(notionPropToString({ type: 'number', number: 42 })).toBe('42');
    expect(notionPropToString({ type: 'checkbox', checkbox: false })).toBe('false');
    expect(notionPropToString({ type: 'relation', relation: [] })).toBe('');
    expect(notionPropToString(null)).toBe('');
  });
});

describe('notionToDrafts', () => {
  it('flattens pages into rows the shared mapper understands', () => {
    const rows = notionPagesToRows(pages);
    expect(rows[0]).toMatchObject({
      Name: 'Local-first',
      URL: 'https://www.inkandswitch.com/local-first/',
      Keywords: 'crdt,sync',
      Date: '2024-02-01',
    });
  });

  it('maps through an inferred ColumnMapping and keeps the page id', () => {
    const mapping = inferNotionMapping(pages);
    expect(mapping['URL']?.field).toBe('url');
    expect(mapping['Keywords']?.field).toBe('tags');

    const r = notionToDrafts(pages, mapping);
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0]).toMatchObject({
      url: 'https://www.inkandswitch.com/local-first/',
      title: 'Local-first',
      tags: ['crdt', 'sync'],
    });
    expect(r.drafts[0]?.extra).toMatchObject({ notionPageId: 'page-1' });
    expect(r.malformed).toHaveLength(1);
    expect(r.detected.sourceLabel).toBe('Notion database');
  });

  it('attaches the right page id when an earlier row was malformed', () => {
    const reversed = [pages[1]!, pages[0]!];
    const r = notionToDrafts(reversed, inferNotionMapping(reversed));
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0]?.extra).toMatchObject({ notionPageId: 'page-1' });
  });
});
