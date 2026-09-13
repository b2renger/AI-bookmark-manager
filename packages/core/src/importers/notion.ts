import type { ColumnMapping } from '../csv/mapping.js';
import { applyMapping, inferMapping } from '../csv/mapping.js';
import type { ImportResult, Importer, ImportSource } from './types.js';
import { summarise } from './util.js';

// Notion is v1.5 and lands through the SAME ColumnMapping UI as CSV. This file is deliberately
// pure: the interface the host implements plus the property-bag → row flattening. The fetch client,
// its `Notion-Version: 2025-09-03` header, the ~3 rps limiter and the 429 `Retry-After` backoff
// (ported from legacy/services/notionService.ts) live in apps/desktop/src/main — never here.

const SOURCE_LABEL = 'Notion database';

export interface NotionProp {
  id?: string;
  name?: string;
  type: string;
}

export interface NotionPage {
  id: string;
  url?: string;
  created_time?: string;
  last_edited_time?: string;
  properties: Record<string, unknown>;
}

export interface NotionDataSource {
  id: string;
  name: string;
  schema: Record<string, NotionProp>;
}

/** Implemented by the host. Core only ever receives already-fetched pages. */
export interface NotionClient {
  listDatabases(): Promise<{ id: string; title: string }[]>;
  getDataSources(databaseId: string): Promise<NotionDataSource[]>;
  queryDataSource(
    dataSourceId: string,
    cursor?: string,
  ): Promise<{ results: NotionPage[]; next_cursor: string | null }>;
  /** Markdown of the first n blocks, ONE level, no recursion. */
  firstBlocks(pageId: string, n: number): Promise<string>;
}

type PropValue = Record<string, unknown> & { type?: string };

function richText(v: unknown): string {
  if (!Array.isArray(v)) return '';
  return v
    .map((t) => (t as { plain_text?: string })?.plain_text ?? '')
    .join('')
    .trim();
}

/** One Notion property → the flat string a ColumnMapping understands. */
export function notionPropToString(prop: unknown): string {
  if (prop === null || prop === undefined) return '';
  if (typeof prop === 'string' || typeof prop === 'number' || typeof prop === 'boolean') {
    return String(prop);
  }
  const p = prop as PropValue;
  switch (p.type) {
    case 'title': return richText(p['title']);
    case 'rich_text': return richText(p['rich_text']);
    case 'url': return typeof p['url'] === 'string' ? p['url'] : '';
    case 'email': return typeof p['email'] === 'string' ? p['email'] : '';
    case 'number': return p['number'] === null || p['number'] === undefined ? '' : String(p['number']);
    case 'checkbox': return p['checkbox'] ? 'true' : 'false';
    case 'select': return (p['select'] as { name?: string } | null)?.name ?? '';
    case 'status': return (p['status'] as { name?: string } | null)?.name ?? '';
    case 'multi_select':
      return ((p['multi_select'] as { name?: string }[] | null) ?? [])
        .map((o) => o?.name ?? '').filter(Boolean).join(',');
    case 'date': return (p['date'] as { start?: string } | null)?.start ?? '';
    case 'created_time': return typeof p['created_time'] === 'string' ? p['created_time'] : '';
    case 'last_edited_time':
      return typeof p['last_edited_time'] === 'string' ? p['last_edited_time'] : '';
    case 'people':
      return ((p['people'] as { name?: string }[] | null) ?? [])
        .map((o) => o?.name ?? '').filter(Boolean).join(', ');
    case 'files':
      return ((p['files'] as { name?: string; external?: { url?: string } }[] | null) ?? [])
        .map((f) => f?.external?.url ?? f?.name ?? '').filter(Boolean).join(', ');
    default:
      return '';
  }
}

/** Pages → the `Record<string,string>` rows the shared mapper consumes. */
export function notionPagesToRows(pages: readonly NotionPage[]): Record<string, string>[] {
  return pages.map((page) => {
    const row: Record<string, string> = {};
    for (const [name, prop] of Object.entries(page.properties ?? {})) {
      row[name] = notionPropToString(prop);
    }
    if (page.created_time && row['created_time'] === undefined) row['created_time'] = page.created_time;
    return row;
  });
}

/** Infers a mapping from the page properties when the caller has no user-edited one yet. */
export function inferNotionMapping(pages: readonly NotionPage[]): ColumnMapping {
  const rows = notionPagesToRows(pages);
  const headers = Object.keys(rows[0] ?? {});
  return inferMapping(headers, rows.slice(0, 25));
}

export function notionToDrafts(pages: readonly NotionPage[], mapping: ColumnMapping): ImportResult {
  const rows = notionPagesToRows(pages);
  const { drafts, malformed } = applyMapping(rows, mapping);
  // applyMapping reports malformed rows by 1-based row index, so the surviving drafts map back to
  // their page in order once those indices are skipped.
  const skipped = new Set(malformed.map((m) => m.line));
  let draftIndex = 0;
  for (let i = 0; i < rows.length && draftIndex < drafts.length; i++) {
    if (skipped.has(i + 1)) continue;
    const page = pages[i];
    const draft = drafts[draftIndex++]!;
    if (page?.id) draft.extra = { ...(draft.extra ?? {}), notionPageId: page.id };
  }
  return summarise(drafts, malformed, SOURCE_LABEL);
}

export const notionImporter: Importer = {
  id: 'notion',
  // Notion never arrives as a file; it is always driven by the host through NotionClient.
  sniff: (): number => 0,
  parse(src: ImportSource, opts?: unknown): ImportResult {
    const pages = (opts as { pages?: NotionPage[] } | undefined)?.pages;
    if (!pages) {
      return summarise([], [{ raw: src.kind, reason: 'notion importer needs { pages } in opts' }], SOURCE_LABEL);
    }
    const mapping = (opts as { mapping?: ColumnMapping }).mapping ?? inferNotionMapping(pages);
    return notionToDrafts(pages, mapping);
  },
};
