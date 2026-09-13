import type { BookmarkDraft, ImportResult, Importer, ImportSource, MalformedRow } from './types.js';
import { makeDraft, summarise, srcText, webkitToIso } from './util.js';

// Chromium's `Bookmarks` JSON (Chrome, Edge, Brave, Vivaldi). `date_added` is the WebKit epoch:
// microseconds since 1601-01-01 → (n / 1000 − 11644473600000) ms.

const SOURCE_LABEL = 'Chromium bookmarks (JSON)';

interface ChromeNode {
  type?: string;
  name?: string;
  url?: string;
  date_added?: string | number;
  date_last_used?: string | number;
  guid?: string;
  children?: ChromeNode[];
}

interface ChromeFile {
  roots?: Record<string, ChromeNode | unknown>;
  version?: number;
}

/** Chrome names its top-level roots; they are containers, not folders the user sees. */
const ROOT_LABELS: Record<string, string> = {
  bookmark_bar: 'Bookmarks bar',
  other: 'Other bookmarks',
  synced: 'Mobile bookmarks',
};

export function sniffChrome(src: ImportSource): number {
  const text = srcText(src).trimStart();
  if (!text.startsWith('{')) return 0;
  if (!/"roots"\s*:/.test(text)) return 0;
  if (/"bookmark_bar"\s*:/.test(text)) return 1;
  return /"date_added"\s*:/.test(text) ? 0.8 : 0.4;
}

export function parseChrome(text: string): ImportResult {
  const drafts: BookmarkDraft[] = [];
  const malformed: MalformedRow[] = [];
  let doc: ChromeFile;
  try {
    doc = JSON.parse(text) as ChromeFile;
  } catch (e) {
    return summarise([], [{ raw: text.slice(0, 200), reason: `invalid JSON: ${msg(e)}` }], SOURCE_LABEL);
  }

  const roots = doc.roots ?? {};
  for (const [key, value] of Object.entries(roots)) {
    if (!isNode(value)) continue;
    const label = ROOT_LABELS[key];
    // The root container itself is not a folder level; its children start at depth 0.
    walk(value, label ? [label] : [], drafts, malformed);
  }
  return summarise(drafts, malformed, SOURCE_LABEL);
}

function isNode(v: unknown): v is ChromeNode {
  return typeof v === 'object' && v !== null && ('children' in v || 'url' in v || 'type' in v);
}

function walk(
  node: ChromeNode,
  path: string[],
  drafts: BookmarkDraft[],
  malformed: MalformedRow[],
): void {
  for (const child of node.children ?? []) {
    if (child.type === 'folder' || (child.children && !child.url)) {
      walk(child, child.name ? [...path, child.name] : path, drafts, malformed);
      continue;
    }
    if (!child.url) {
      malformed.push({ raw: JSON.stringify(child).slice(0, 200), reason: 'node without url' });
      continue;
    }
    const extra: Record<string, unknown> = {};
    if (child.guid) extra['chromeGuid'] = child.guid;
    drafts.push(makeDraft({
      url: child.url,
      title: child.name,
      folderPath: path,
      createdAt: webkitToIso(child.date_added),
      extra,
    }));
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const chromeImporter: Importer = {
  id: 'chrome',
  sniff: sniffChrome,
  parse: (src: ImportSource): ImportResult => parseChrome(srcText(src)),
};
