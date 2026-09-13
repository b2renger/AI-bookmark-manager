import type { BookmarkDraft, ImportResult, Importer, ImportSource, MalformedRow } from './types.js';
import { makeDraft, summarise, srcText, toIso } from './util.js';

// Karakeep (ex-Hoarder) JSON export. The richest source we import: tags, note, the extracted
// description and per-item highlights all survive.

const SOURCE_LABEL = 'Karakeep (JSON)';

interface KarakeepContent {
  type?: string;
  url?: string;
  title?: string;
  description?: string;
  author?: string;
  publisher?: string;
  text?: string;
  sourceUrl?: string;
}

interface KarakeepTag {
  name?: string;
}

interface KarakeepBookmark {
  id?: string;
  createdAt?: string | number;
  title?: string | null;
  note?: string | null;
  summary?: string | null;
  archived?: boolean;
  favourited?: boolean;
  tags?: (string | KarakeepTag)[];
  content?: KarakeepContent;
  highlights?: { text?: string }[];
}

export function sniffKarakeep(src: ImportSource): number {
  const text = srcText(src).trimStart();
  if (!text.startsWith('{') && !text.startsWith('[')) return 0;
  const hasContentLink = /"content"\s*:\s*\{[^}]*"type"\s*:\s*"link"/.test(text);
  if (hasContentLink && /"bookmarks"\s*:/.test(text)) return 1;
  if (hasContentLink) return 0.85;
  return 0;
}

function tagName(t: string | KarakeepTag): string | undefined {
  return typeof t === 'string' ? t : t?.name;
}

export function parseKarakeep(text: string): ImportResult {
  const drafts: BookmarkDraft[] = [];
  const malformed: MalformedRow[] = [];
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    const reason = `invalid JSON: ${e instanceof Error ? e.message : String(e)}`;
    return summarise([], [{ raw: text.slice(0, 200), reason }], SOURCE_LABEL);
  }

  const list: KarakeepBookmark[] = Array.isArray(doc)
    ? (doc as KarakeepBookmark[])
    : ((doc as { bookmarks?: KarakeepBookmark[] })?.bookmarks ?? []);

  for (const b of list) {
    const content = b?.content ?? {};
    const url = content.url ?? content.sourceUrl;
    if (!url) {
      malformed.push({
        raw: JSON.stringify(b).slice(0, 200),
        reason: content.type && content.type !== 'link' ? `unsupported content type: ${content.type}` : 'no url',
      });
      continue;
    }
    const highlights = (b.highlights ?? []).map((h) => h?.text).filter(Boolean).join('\n');
    const note = [b.note ?? '', highlights].filter(Boolean).join('\n\n');
    const extra: Record<string, unknown> = {};
    if (b.id) extra['karakeepId'] = b.id;
    if (b.archived) extra['archived'] = true;
    if (b.favourited) extra['favourited'] = true;

    drafts.push(makeDraft({
      url,
      title: b.title ?? content.title ?? undefined,
      note,
      summary: b.summary ?? content.description ?? undefined,
      author: content.author ?? content.publisher ?? undefined,
      tags: (b.tags ?? []).map(tagName),
      createdAt: toIso(b.createdAt ?? undefined),
      extra,
    }));
  }
  return summarise(drafts, malformed, SOURCE_LABEL);
}

export const karakeepImporter: Importer = {
  id: 'karakeep',
  sniff: sniffKarakeep,
  parse: (src: ImportSource): ImportResult => parseKarakeep(srcText(src)),
};
