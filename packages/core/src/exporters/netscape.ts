import type { BookmarkExportRow, ExportSink } from './types.js';

// Lossy by design (summary and platform do not survive), and the file says so in its header
// comment. Every browser and every bookmark service reads this format, which is why it exists.

export interface WriteNetscapeOptions {
  title?: string;
  /** Indentation unit. Browsers ignore it; humans do not. */
  indent?: string;
}

interface FolderNode {
  name: string;
  children: Map<string, FolderNode>;
  rows: BookmarkExportRow[];
}

const HEADER = (title: string) => `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. Exported by Cairn.
     Netscape bookmark files are LOSSY: summaries, notes beyond <DD> and platform metadata
     are not represented. Use the JSONL export for a lossless copy. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>${escapeHtml(title)}</TITLE>
<H1>${escapeHtml(title)}</H1>
`;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unixSeconds(iso: string | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : String(Math.floor(t / 1000));
}

function buildTree(rows: Iterable<BookmarkExportRow>): { root: FolderNode; count: number } {
  const root: FolderNode = { name: '', children: new Map(), rows: [] };
  let count = 0;
  for (const row of rows) {
    count++;
    let node = root;
    for (const segment of row.folderPath ?? []) {
      let child = node.children.get(segment);
      if (!child) {
        child = { name: segment, children: new Map(), rows: [] };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.rows.push(row);
  }
  return { root, count };
}

/** Groups rows by `folderPath` into nested `<DL>`s and streams the file out. */
export async function writeNetscape(
  rows: Iterable<BookmarkExportRow>,
  sink: ExportSink,
  opts?: WriteNetscapeOptions,
): Promise<{ items: number; bytes: number }> {
  const title = opts?.title ?? 'Bookmarks';
  const unit = opts?.indent ?? '    ';
  const { root, count } = buildTree(rows);
  let bytes = 0;
  const write = async (s: string): Promise<void> => {
    bytes += s.length;
    await sink.write(s);
  };

  await write(HEADER(title));

  const emit = async (node: FolderNode, depth: number): Promise<void> => {
    const pad = unit.repeat(depth);
    await write(`${pad}<DL><p>\n`);
    for (const row of node.rows) {
      const attrs = [`HREF="${escapeHtml(row.url)}"`];
      const added = unixSeconds(row.createdAt);
      if (added) attrs.push(`ADD_DATE="${added}"`, `LAST_MODIFIED="${added}"`);
      if (row.tags.length) attrs.push(`TAGS="${escapeHtml(row.tags.join(','))}"`);
      await write(`${pad}${unit}<DT><A ${attrs.join(' ')}>${escapeHtml(row.title ?? row.url)}</A>\n`);
      const note = row.note ?? row.summary;
      if (note) await write(`${pad}${unit}<DD>${escapeHtml(note.replace(/\s*\n\s*/g, ' '))}\n`);
    }
    for (const child of node.children.values()) {
      await write(`${pad}${unit}<DT><H3>${escapeHtml(child.name)}</H3>\n`);
      await emit(child, depth + 1);
    }
    await write(`${pad}</DL><p>\n`);
  };

  await emit(root, 0);
  await sink.close();
  return { items: count, bytes };
}
