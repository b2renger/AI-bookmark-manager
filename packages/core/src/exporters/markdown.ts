import type { BookmarkExportRow, ExportSink } from './types.js';

// An Obsidian-compatible vault: one note per bookmark under its folder path, plus an index.md.
// Lossy by design; the header of index.md says so.

export interface WriteMarkdownOptions {
  /** Vault title, used as the index heading. */
  title?: string;
  /** `source` frontmatter value. Default `cairn`. */
  source?: string;
}

export type SinkFactory = (relPath: string) => ExportSink;

const MAX_SLUG = 64;

export function slugify(input: string): string {
  const base = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, '');
  return base || 'bookmark';
}

/** Obsidian forbids these in file names; folder segments get the same treatment. */
function safeSegment(segment: string): string {
  return segment.replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').trim() || 'untitled';
}

function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function frontmatter(row: BookmarkExportRow, source: string): string {
  const lines = ['---', `url: ${yamlString(row.url)}`];
  lines.push(row.tags.length ? `tags: [${row.tags.map((t) => yamlString(t)).join(', ')}]` : 'tags: []');
  lines.push(`created: ${row.createdAt ? yamlString(row.createdAt) : 'null'}`);
  lines.push(`source: ${yamlString(source)}`);
  if (row.platform) lines.push(`platform: ${yamlString(row.platform)}`);
  if (row.author) lines.push(`author: ${yamlString(row.author)}`);
  lines.push(`cairn_id: ${yamlString(row.id)}`);
  lines.push('---', '');
  return lines.join('\n');
}

function body(row: BookmarkExportRow): string {
  const out = [`# ${row.title ?? row.url}`, '', `<${row.url}>`, ''];
  if (row.summary) out.push(row.summary, '');
  if (row.note) out.push('## Notes', '', row.note, '');
  return out.join('\n');
}

/**
 * Writes `<folderPath>/<slug>.md` per row plus `index.md`. `sinkFactory` is what keeps this pure:
 * the host decides whether a relative path becomes a file, a ZIP entry or an in-memory buffer.
 */
export async function writeMarkdownVault(
  rows: Iterable<BookmarkExportRow>,
  sinkFactory: SinkFactory,
  opts?: WriteMarkdownOptions,
): Promise<{ items: number; files: string[] }> {
  const source = opts?.source ?? 'cairn';
  const used = new Set<string>();
  const files: string[] = [];
  const index: { path: string; row: BookmarkExportRow }[] = [];

  for (const row of rows) {
    const dir = (row.folderPath ?? []).map(safeSegment).join('/');
    // Untitled bookmarks are named after host + path, not the whole URL with its scheme.
    const base = slugify(row.title ?? row.url.replace(/^[a-z]+:\/\//i, ''));
    let candidate = dir ? `${dir}/${base}.md` : `${base}.md`;
    let n = 2;
    while (used.has(candidate.toLowerCase())) {
      const name = `${base}-${n++}`;
      candidate = dir ? `${dir}/${name}.md` : `${name}.md`;
    }
    used.add(candidate.toLowerCase());

    const sink = sinkFactory(candidate);
    await sink.write(frontmatter(row, source));
    await sink.write(body(row));
    await sink.close();
    files.push(candidate);
    index.push({ path: candidate, row });
  }

  const indexSink = sinkFactory('index.md');
  await indexSink.write(
    `# ${opts?.title ?? 'Cairn export'}\n\n` +
    `> Markdown exports are lossy: ops history, chunks and embeddings are not included.\n` +
    `> Use the JSONL export for a lossless copy.\n\n` +
    `${index.length} bookmark${index.length === 1 ? '' : 's'}.\n\n`,
  );
  for (const entry of index) {
    const label = entry.row.title ?? entry.row.url;
    await indexSink.write(`- [${label.replace(/[[\]]/g, '')}](${encodeURI(entry.path)})\n`);
  }
  await indexSink.close();
  files.push('index.md');

  return { items: index.length, files };
}
