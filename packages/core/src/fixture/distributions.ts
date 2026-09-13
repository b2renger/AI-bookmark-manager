import type { Random } from '../ports/index.js';
import type { FixtureLang } from './text.js';
import { TOPIC_DOMAINS } from './vocab.js';

// Host, platform, date and language distributions (plans/TECHNICAL-DESIGN.md §8.2).

/** The hand-seeded head of the Zipf distribution, in rank order. */
export const HEAD_HOSTS: readonly string[] = [
  'youtube.com', 'github.com', 'medium.com', 'arxiv.org', 'lemonde.fr',
  'twitter.com', 'news.ycombinator.com', 'wikipedia.org', 'threads.net', 'substack.com',
];

export const HOST_COUNT = 2000;

const HOST_SUFFIXES: readonly string[] = [
  'lab', 'notes', 'daily', 'press', 'studio', 'hub', 'zone', 'works', 'club', 'weekly',
  'review', 'digest',
];
const HOST_TLDS: readonly string[] = ['com', 'fr', 'org', 'net', 'io', 'dev'];

/** 2,000 hosts: the ten hand-seeded ones, then deterministic `<domain><suffix>.<tld>` combos. */
export function buildHosts(): string[] {
  const out: string[] = [...HEAD_HOSTS];
  const seen = new Set(out);
  outer: for (let s = 0; s < HOST_SUFFIXES.length; s++) {
    for (let t = 0; t < HOST_TLDS.length; t++) {
      for (let d = 0; d < TOPIC_DOMAINS.length; d++) {
        const host = `${TOPIC_DOMAINS[d]!.key}${HOST_SUFFIXES[s]!}.${HOST_TLDS[t]!}`;
        if (seen.has(host)) continue;
        seen.add(host);
        out.push(host);
        if (out.length === HOST_COUNT) break outer;
      }
    }
  }
  return out;
}

export interface ZipfSampler {
  /** Rank index in [0, n). */
  sample(random: Random): number;
}

/** Zipf(s) over n ranks, sampled by binary search on the cumulative weights. */
export function zipf(n: number, s: number): ZipfSampler {
  const cum = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += 1 / Math.pow(i + 1, s);
    cum[i] = acc;
  }
  const total = acc;
  return {
    sample(random: Random): number {
      const x = random.float() * total;
      let lo = 0;
      let hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid]! < x) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    },
  };
}

export type Platform = 'youtube' | 'twitter' | 'github' | 'threads' | 'article' | 'pdf' | 'website';

/** The same ladder the real detector uses: host first, then the `.pdf` extension, then default. */
export function platformFor(host: string, path: string): Platform {
  if (path.endsWith('.pdf')) return 'pdf';
  if (host.endsWith('youtube.com') || host === 'youtu.be') return 'youtube';
  if (host.endsWith('twitter.com') || host === 'x.com') return 'twitter';
  if (host.endsWith('github.com')) return 'github';
  if (host.endsWith('threads.net')) return 'threads';
  if (
    host.endsWith('medium.com') || host.endsWith('substack.com') || host.endsWith('arxiv.org') ||
    host.endsWith('lemonde.fr') || host.endsWith('wikipedia.org') ||
    host === 'news.ycombinator.com' || host.includes('press') || host.includes('review') ||
    host.includes('daily') || host.includes('weekly') || host.includes('digest')
  ) {
    return 'article';
  }
  return 'website';
}

export const DATE_SPAN_YEARS = 12;
const HALF_LIFE_MS = 18 * 30.44 * 24 * 3600 * 1000; // 18 months
const SPAN_MS = DATE_SPAN_YEARS * 365.25 * 24 * 3600 * 1000;
const WEEKEND_KEEP = 0.55;

/** Age in ms from an exponential truncated at the 12-year span (inverse CDF). */
function sampleAgeMs(random: Random): number {
  const lambda = Math.LN2 / HALF_LIFE_MS;
  const cap = 1 - Math.exp(-lambda * SPAN_MS);
  return -Math.log(1 - random.float() * cap) / lambda;
}

/** Creation timestamp: exponential recency decay plus a weekend dip, rejection-sampled. */
export function sampleCreatedAt(random: Random, nowMs: number): number {
  for (let attempt = 0; attempt < 8; attempt++) {
    const t = nowMs - sampleAgeMs(random);
    const day = new Date(t).getUTCDay();
    const weekend = day === 0 || day === 6;
    if (!weekend || random.float() < WEEKEND_KEEP) {
      // Spread over the working day rather than sitting on the sampling instant.
      const hour = 7 + Math.floor(random.float() * 14);
      const d = new Date(t);
      d.setUTCHours(hour, Math.floor(random.float() * 60), Math.floor(random.float() * 60), 0);
      return d.getTime();
    }
  }
  return nowMs - sampleAgeMs(random);
}

const OTHER_LANGS: readonly string[] = ['de', 'es', 'it', 'pt', 'nl'];

export interface SampledLang {
  /** What goes into `bookmarks.lang`. */
  code: string;
  /** Which vocabulary the text generator uses. */
  kind: FixtureLang;
}

/** 45 % fr, 45 % en, 10 % other/mixed. */
export function sampleLang(random: Random): SampledLang {
  const u = random.float();
  if (u < 0.45) return { code: 'fr', kind: 'fr' };
  if (u < 0.9) return { code: 'en', kind: 'en' };
  const code = OTHER_LANGS[Math.floor(random.float() * OTHER_LANGS.length) % OTHER_LANGS.length]!;
  return { code, kind: 'other' };
}
