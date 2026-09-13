import { parseHTML } from 'linkedom';
import type { BookmarkDraft, ImportResult, Importer, ImportSource, MalformedRow } from './types.js';
import { makeDraft, splitTags, summarise, srcText, toIso } from './util.js';
import { isProbablyUrl } from './urlGuard.js';

// Two paths, one importer (plans/TECHNICAL-DESIGN.md §4.2):
//  - a real DOM walk for a whole bookmarks.html, so <H3> nesting becomes folderPath[];
//  - the legacy line regexes (port of legacy/components/UrlInput.tsx#handleSubmit) for pasted
//    fragments and plain URL lists, which are not valid documents.

const SOURCE_LABEL = 'Netscape bookmarks (HTML)';

// Minimal structural DOM. linkedom ships its own types but they resolve against `typeof
// globalThis`, which core does not have (lib ES2023, types: []).
interface DomNode {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<DomNode> & Iterable<DomNode>;
  attributes?: ArrayLike<{ name: string; value: string }>;
  getAttribute?(name: string): string | null;
}
const ELEMENT_NODE = 1;

export interface NetscapeParseOptions {
  /** Force the line-regex path (pasted fragment). Default: auto — DOM when a <DL> is present. */
  mode?: 'auto' | 'dom' | 'lines';
}

/** `<!DOCTYPE NETSCAPE-Bookmark-file-1>` / a `<DL>` → certain; a list of bare URLs → likely. */
export function sniffNetscape(src: ImportSource): number {
  const text = srcText(src);
  if (!text.trim()) return 0;
  if (/<!DOCTYPE\s+NETSCAPE-Bookmark-file-1/i.test(text)) return 1;
  if (/<DL\b/i.test(text) && /<A\s[^>]*HREF=/i.test(text)) return 1;
  if (/<A\s[^>]*HREF=/i.test(text)) return 0.7;
  const lines = text.split('\n').map((l) => stripListPrefix(l.trim())).filter(Boolean);
  if (lines.length === 0) return 0;
  const urlish = lines.filter((l) => isProbablyUrl(l)).length;
  return urlish / lines.length >= 0.8 ? 0.6 : 0;
}

function stripListPrefix(line: string): string {
  return line.replace(/^\d+\s*[.)\-]\s+/, '').replace(/^[-*•]\s+/, '').trim();
}

// linkedom preserves attribute-name case exactly as written, and bookmark files use `HREF`,
// `ADD_DATE`, `TAGS` — so every lookup is done case-insensitively over the attribute list.
function attr(node: DomNode, name: string): string | undefined {
  const attrs = node.attributes;
  if (attrs) {
    const lower = name.toLowerCase();
    for (let i = 0; i < attrs.length; i++) {
      const a = attrs[i];
      if (a && a.name.toLowerCase() === lower) return a.value;
    }
    return undefined;
  }
  const v = node.getAttribute?.(name) ?? node.getAttribute?.(name.toUpperCase());
  return v === null || v === undefined ? undefined : v;
}

function text(node: DomNode): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Document-order walk with a folder stack. Real bookmark files are not well-formed — browsers emit
 * unclosed <DT>/<P>, so the nested <DL> often ends up *inside* the <DT> that introduced it. Tracking
 * DL enter/exit instead of assuming a shape is what makes this robust.
 */
export function parseNetscapeDom(html: string): ImportResult {
  const { document } = parseHTML(html) as unknown as { document: DomNode };
  const drafts: BookmarkDraft[] = [];
  const malformed: MalformedRow[] = [];
  const stack: (string | null)[] = [];
  let pendingFolder: string | null = null;
  let lastDraft: BookmarkDraft | null = null;

  const walk = (node: DomNode): void => {
    for (const child of node.childNodes) {
      if (child.nodeType !== ELEMENT_NODE) continue;
      const tag = child.nodeName.toUpperCase();
      if (tag === 'H3') {
        pendingFolder = text(child) || null;
        lastDraft = null;
        continue; // an <H3> never contains bookmarks
      }
      if (tag === 'DL') {
        stack.push(pendingFolder);
        pendingFolder = null;
        lastDraft = null;
        walk(child);
        stack.pop();
        lastDraft = null;
        continue;
      }
      if (tag === 'A') {
        const href = attr(child, 'href');
        if (!href || !href.trim()) {
          malformed.push({ raw: text(child).slice(0, 200), reason: 'anchor without href' });
          continue;
        }
        const draft = makeDraft({
          url: href,
          title: text(child) || undefined,
          tags: splitTags(attr(child, 'tags')),
          folderPath: stack.filter((f): f is string => f !== null),
          createdAt: toIso(attr(child, 'add_date'), 's'),
          extra: buildExtra(child),
        });
        drafts.push(draft);
        lastDraft = draft;
        continue;
      }
      if (tag === 'DD') {
        const note = text(child);
        if (note && lastDraft && !lastDraft.note) lastDraft.note = note;
        continue;
      }
      walk(child);
    }
  };

  walk(document);
  return summarise(drafts, malformed, SOURCE_LABEL);
}

function buildExtra(a: DomNode): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {};
  const icon = attr(a, 'icon_uri');
  const lastModified = toIso(attr(a, 'last_modified'), 's');
  if (lastModified) extra['lastModified'] = lastModified;
  if (icon) extra['iconUri'] = icon;
  return Object.keys(extra).length ? extra : undefined;
}

/**
 * Legacy line path (legacy/components/UrlInput.tsx#handleSubmit): one line at a time, `<A HREF …
 * ADD_DATE>` or a bare URL with a `1.` / `- ` list prefix. No folders — `folderPath` is undefined.
 */
export function parseNetscapeLines(input: string): ImportResult {
  const drafts: BookmarkDraft[] = [];
  const malformed: MalformedRow[] = [];
  const lines = input.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    const withDate = line.match(/<a\s+href="([^"]+)"[^>]*add_date="(\d+)"/i);
    if (withDate?.[1] && withDate[2]) {
      drafts.push(makeDraft({
        url: withDate[1],
        title: anchorText(line),
        createdAt: toIso(withDate[2], 's'),
      }));
      continue;
    }
    const hrefOnly = line.match(/<a\s+href="([^"]+)"/i);
    if (hrefOnly?.[1]) {
      drafts.push(makeDraft({ url: hrefOnly[1], title: anchorText(line) }));
      continue;
    }
    if (line.startsWith('<')) continue; // <DT>, <H1>, <DL> … discarded, as in the legacy code

    const candidate = stripListPrefix(line);
    if (!candidate) continue;
    if (!isProbablyUrl(candidate)) {
      malformed.push({ line: i + 1, raw: line.slice(0, 200), reason: 'not a URL' });
      continue;
    }
    drafts.push(makeDraft({ url: candidate }));
  }
  return summarise(drafts, malformed, 'Pasted links');
}

function anchorText(line: string): string | undefined {
  const m = line.match(/<a\s[^>]*>([\s\S]*?)<\/a>/i);
  if (!m?.[1]) return undefined;
  return decodeEntities(m[1].replace(/<[^>]+>/g, '')).trim() || undefined;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#039': "'", nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
    const key = name.toLowerCase();
    if (ENTITIES[key] !== undefined) return ENTITIES[key];
    if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(1), 10));
    return whole;
  });
}

export const netscapeImporter: Importer = {
  id: 'netscape',
  sniff: sniffNetscape,
  parse(src: ImportSource, opts?: unknown): ImportResult {
    const raw = srcText(src);
    const mode = (opts as NetscapeParseOptions | undefined)?.mode ?? 'auto';
    if (mode === 'lines') return parseNetscapeLines(raw);
    if (mode === 'dom') return parseNetscapeDom(raw);
    return /<DL\b/i.test(raw) ? parseNetscapeDom(raw) : parseNetscapeLines(raw);
  },
};
