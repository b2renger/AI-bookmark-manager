import type { Random } from '../ports/index.js';
import { TOPIC_DOMAINS, TOPIC_MODIFIERS } from './vocab.js';

// The messy tag universe (plans/TECHNICAL-DESIGN.md §8.2): 900 canonical concepts, each spawning
// 1–9 near-duplicate raw tags — accent-stripped, singular/plural, FR/EN pair, hyphen↔space,
// underscore, case noise. `truth` (raw → canonical) is the ground truth for the P4 consolidation
// eval and is persisted into the fixture itself as settings('fixture.tagTruth').

export const CANONICAL_COUNT = 900;

/** Lowercase + whitespace-collapse. NOT accent-folded: `café` and `cafe` must stay two rows, or
 *  there would be nothing for consolidation to merge. Matches `tags.label_norm`'s unique index. */
export function tagLabelNorm(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
}

export interface CanonicalConcept {
  label: string;
  /** The cross-language counterpart; one of the near-duplicate variants. */
  pair: string;
  /** The topic this concept belongs to, so bookmarks get topically plausible tags. */
  topic: number;
  domainKey: string;
}

/** 900 concepts: 400 French domain terms, 400 `<domain>-<modifier>` compounds, 100
 *  `<domain>-<term>` compounds. Never an English term on its own — the English spelling is a
 *  VARIANT of its French concept, which is what makes the FR/EN pair family gradeable. */
export function buildCanonicalConcepts(target = CANONICAL_COUNT): CanonicalConcept[] {
  const out: CanonicalConcept[] = [];
  const seen = new Set<string>();
  const push = (label: string, pair: string, topic: number, domainKey: string): boolean => {
    const key = tagLabelNorm(label);
    if (key.length === 0 || seen.has(key)) return false;
    seen.add(key);
    out.push({ label, pair, topic, domainKey });
    return out.length >= target;
  };
  const mods = TOPIC_MODIFIERS.length;

  for (let d = 0; d < TOPIC_DOMAINS.length; d++) {
    const dom = TOPIC_DOMAINS[d]!;
    for (let i = 0; i < dom.fr.length; i++) {
      if (push(dom.fr[i]!, dom.en[i]!, d * mods + (i % mods), dom.key)) return out;
    }
  }
  for (let d = 0; d < TOPIC_DOMAINS.length; d++) {
    const dom = TOPIC_DOMAINS[d]!;
    for (let m = 0; m < mods; m++) {
      const mod = TOPIC_MODIFIERS[m]!;
      if (push(`${dom.key}-${mod.fr}`, `${dom.key}-${mod.en}`, d * mods + m, dom.key)) return out;
    }
  }
  for (let d = 0; d < TOPIC_DOMAINS.length; d++) {
    const dom = TOPIC_DOMAINS[d]!;
    for (let i = 0; i < dom.fr.length; i++) {
      const topic = d * mods + (i % mods);
      if (push(`${dom.key}-${dom.fr[i]!}`, `${dom.key}-${dom.en[i]!}`, topic, dom.key)) return out;
    }
  }
  return out;
}

export interface RawTag {
  /** As stored in `tags.label`, case noise included. */
  label: string;
  /** `tags.label_norm` — unique within the collection. */
  norm: string;
  canonical: string;
  topic: number;
}

export interface TagUniverse {
  canonicals: CanonicalConcept[];
  raw: RawTag[];
  /** raw label → canonical label. The P4 eval's answer key. */
  truth: Record<string, string>;
  /** topic index → raw-tag indices, for topically plausible assignment. */
  byTopic: Map<number, number[]>;
}

function plural(s: string): string {
  if (/[sxz]$/.test(s)) return s;
  if (/al$/.test(s)) return s.slice(0, -2) + 'aux';
  return s + 's';
}

function titleCase(s: string): string {
  return s.replace(/(^|[\s\-_])(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toUpperCase());
}

/** Twelve candidate spellings; at least nine survive the per-concept dedupe for every concept. */
function candidatesOf(c: CanonicalConcept): string[] {
  const base = c.label;
  const bare = stripAccents(base);
  const pair = c.pair;
  const barePair = stripAccents(pair);
  const d = c.domainKey;
  return [
    base,
    bare,
    plural(base),
    plural(bare),
    pair,
    barePair,
    plural(pair),
    `${bare}-${d}`,
    `${bare} ${d}`,
    `${bare}_${d}`,
    `${bare}-notes`,
    `${bare}-${barePair}`,
  ];
}

/** Case noise on the stored label only — `label_norm` lowercases, so it never adds a row. */
function restyle(label: string, style: number): string {
  if (style === 1) return titleCase(label);
  if (style === 2) return label.toUpperCase();
  return label;
}

/** Mean ≈ 7.2 variants per concept, so ~6,500 raw tags survive the label_norm uniqueness rule. */
function variantCount(random: Random): number {
  return Math.min(9, 1 + Math.floor(9 * Math.pow(random.float(), 0.32)));
}

export function buildTagUniverse(random: Random): TagUniverse {
  const canonicals = buildCanonicalConcepts();
  const raw: RawTag[] = [];
  const truth: Record<string, string> = {};
  const byTopic = new Map<number, number[]>();
  const seen = new Set<string>();

  for (let ci = 0; ci < canonicals.length; ci++) {
    const c = canonicals[ci]!;
    const want = variantCount(random);
    const local = new Set<string>();
    let taken = 0;
    for (const cand of candidatesOf(c)) {
      if (taken >= want) break;
      const norm = tagLabelNorm(cand);
      if (norm.length === 0 || local.has(norm) || seen.has(norm)) continue;
      local.add(norm);
      seen.add(norm);
      const label = restyle(cand, (ci + taken) % 4);
      const idx = raw.length;
      raw.push({ label, norm, canonical: c.label, topic: c.topic });
      truth[label] = c.label;
      const bucket = byTopic.get(c.topic);
      if (bucket) bucket.push(idx);
      else byTopic.set(c.topic, [idx]);
      taken++;
    }
  }
  return { canonicals, raw, truth, byTopic };
}

/** 0–5 raw tags for one bookmark: mostly from its own topic, sometimes from anywhere. */
export function sampleTagsFor(universe: TagUniverse, topic: number, random: Random): number[] {
  const n = Math.floor(random.float() * 6);
  if (n === 0) return [];
  const own = universe.byTopic.get(topic) ?? [];
  const out = new Set<number>();
  for (let i = 0; i < n; i++) {
    const useOwn = own.length > 0 && random.float() < 0.75;
    const idx = useOwn
      ? own[Math.floor(random.float() * own.length) % own.length]!
      : Math.floor(random.float() * universe.raw.length) % universe.raw.length;
    out.add(idx);
  }
  return [...out];
}
