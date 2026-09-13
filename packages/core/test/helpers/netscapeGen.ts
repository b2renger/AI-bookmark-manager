import { seededRandom } from './random.js';

// Deterministic Netscape file generator for the count/perf test. Same seed → byte-identical file,
// so a failure is always reproducible.

const HOSTS = [
  'example.com', 'arxiv.org', 'news.ycombinator.com', 'developer.mozilla.org', 'lemonde.fr',
  'github.com', 'fr.wikipedia.org', 'youtube.com', 'blog.example.org', 'sqlite.org',
];
const WORDS = [
  'signet', 'lecture', 'archive', 'vidéo', 'papier', 'note', 'référence', 'outil', 'veille',
  'projet', 'café', 'théière', 'brouillon', 'ancien', 'nouveau',
];
const FOLDERS = ['Lecture', 'Outils', 'Veille', 'Archives', 'Vidéos', 'Presse'];
const TAGS = ['ml', 'web', 'rust', 'presse', 'perso', 'todo', 'ref'];

export interface GeneratedNetscape {
  html: string;
  count: number;
  /** Every URL emitted, in document order. */
  urls: string[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Builds a bookmarks.html with `count` anchors spread over a two-level folder tree.
 * Folder distribution, titles, tags and ADD_DATEs all come from the seeded PRNG.
 */
export function generateNetscape(count: number, seed = 42): GeneratedNetscape {
  const rng = seededRandom(seed);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng.float() * arr.length)]!;

  // Distribute the anchors: 10% at the root, the rest across FOLDERS × 4 subfolders.
  const buckets = new Map<string, string[]>();
  const urls: string[] = [];
  const lines: string[] = [];

  for (let i = 0; i < count; i++) {
    const host = pick(HOSTS);
    const url = `https://${host}/${pick(WORDS)}/${i}?p=${Math.floor(rng.float() * 1000)}`;
    const title = `${pick(WORDS)} ${pick(WORDS)} #${i}`;
    const addDate = 1_500_000_000 + Math.floor(rng.float() * 200_000_000);
    const tagCount = Math.floor(rng.float() * 3);
    const tags: string[] = [];
    for (let t = 0; t < tagCount; t++) {
      const tag = pick(TAGS);
      if (!tags.includes(tag)) tags.push(tag);
    }
    const attrs = [`HREF="${escapeHtml(url)}"`, `ADD_DATE="${addDate}"`, `LAST_MODIFIED="${addDate}"`];
    if (tags.length) attrs.push(`TAGS="${tags.join(',')}"`);
    const anchor = `<DT><A ${attrs.join(' ')}>${escapeHtml(title)}</A>`;

    const key = rng.float() < 0.1
      ? ''
      : `${pick(FOLDERS)}␟${`Sous-dossier ${Math.floor(rng.float() * 4) + 1}`}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(anchor);
    else buckets.set(key, [anchor]);
    urls.push(url);
  }

  lines.push(
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  );
  for (const anchor of buckets.get('') ?? []) lines.push(`    ${anchor}`);

  // Group the non-root buckets by their top-level folder so the tree really nests.
  const tops = new Map<string, Map<string, string[]>>();
  for (const [key, anchors] of buckets) {
    if (key === '') continue;
    const [top, sub] = key.split('␟') as [string, string];
    let subs = tops.get(top);
    if (!subs) {
      subs = new Map();
      tops.set(top, subs);
    }
    subs.set(sub, anchors);
  }
  for (const [top, subs] of tops) {
    lines.push(`    <DT><H3>${escapeHtml(top)}</H3>`, '    <DL><p>');
    for (const [sub, anchors] of subs) {
      lines.push(`        <DT><H3>${escapeHtml(sub)}</H3>`, '        <DL><p>');
      for (const anchor of anchors) lines.push(`            ${anchor}`);
      lines.push('        </DL><p>');
    }
    lines.push('    </DL><p>');
  }
  lines.push('</DL><p>', '');

  return { html: lines.join('\n'), count, urls };
}
