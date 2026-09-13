import type { Random } from '../ports/index.js';
import { EN_WORDS, FR_WORDS, type Topic } from './vocab.js';

// Order-1 Markov text over a per-topic corpus (plans/TECHNICAL-DESIGN.md §8.2). The corpus is
// built RNG-free from the topic's term bundle interleaved with filler, so term frequencies differ
// per topic and c-TF-IDF has something to find; only the walk consumes the injected Random.

export type FixtureLang = 'fr' | 'en' | 'other';

export interface MarkovChain {
  starts: readonly string[];
  next: ReadonlyMap<string, readonly string[]>;
}

function fillerFor(lang: FixtureLang): readonly string[] {
  if (lang === 'fr') return FR_WORDS;
  if (lang === 'en') return EN_WORDS;
  return [...FR_WORDS.slice(0, 120), ...EN_WORDS.slice(0, 120)];
}

function termsFor(topic: Topic, lang: FixtureLang): readonly string[] {
  if (lang === 'fr') return topic.termsFr;
  if (lang === 'en') return topic.termsEn;
  return [...topic.termsFr.slice(0, 6), ...topic.termsEn.slice(0, 6)];
}

/** A deterministic token stream for one (topic, lang): terms carry the signal, filler the shape. */
function corpus(topic: Topic, lang: FixtureLang): string[] {
  const terms = termsFor(topic, lang);
  const filler = fillerFor(lang);
  const stride = 7 + (topic.index % 5);
  let f = (topic.index * 13) % filler.length;
  const out: string[] = [];
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i < terms.length; i++) {
      out.push(terms[(i + pass) % terms.length]!);
      const gap = 2 + ((i + pass) % 3);
      for (let k = 0; k < gap; k++) {
        f = (f + stride + k) % filler.length;
        out.push(filler[f]!);
      }
    }
  }
  return out;
}

export function buildChain(topic: Topic, lang: FixtureLang): MarkovChain {
  const tokens = corpus(topic, lang);
  const next = new Map<string, string[]>();
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i]!;
    const b = tokens[i + 1]!;
    const bucket = next.get(a);
    if (bucket) bucket.push(b);
    else next.set(a, [b]);
  }
  return { starts: termsFor(topic, lang), next };
}

/** Chain cache: 400 topics × 3 languages, built once per generate() run. */
export class ChainCache {
  private readonly cache = new Map<string, MarkovChain>();

  get(topic: Topic, lang: FixtureLang): MarkovChain {
    const key = `${String(topic.index)}:${lang}`;
    let c = this.cache.get(key);
    if (!c) {
      c = buildChain(topic, lang);
      this.cache.set(key, c);
    }
    return c;
  }
}

function pick<T>(xs: readonly T[], random: Random): T {
  return xs[Math.floor(random.float() * xs.length) % xs.length]!;
}

/** Walk the chain for `words` tokens. Restarts from a topic term whenever the chain dead-ends. */
export function markovWords(chain: MarkovChain, random: Random, words: number): string[] {
  const out: string[] = [];
  let cur = pick(chain.starts, random);
  for (let i = 0; i < words; i++) {
    out.push(cur);
    const bucket = chain.next.get(cur);
    cur = bucket && bucket.length > 0 ? pick(bucket, random) : pick(chain.starts, random);
  }
  return out;
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

export function markovTitle(chain: MarkovChain, random: Random): string {
  const n = 4 + Math.floor(random.float() * 6);
  return capitalise(markovWords(chain, random, n).join(' '));
}

/** A few sentences, `words` tokens in total. */
export function markovProse(chain: MarkovChain, random: Random, words: number): string {
  const tokens = markovWords(chain, random, words);
  const sentences: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const len = Math.min(tokens.length - i, 8 + Math.floor(random.float() * 10));
    sentences.push(capitalise(tokens.slice(i, i + len).join(' ')) + '.');
    i += len;
  }
  return sentences.join(' ');
}

/** Prose of at least `chars` characters, cut on a word boundary just past the target. */
export function markovChars(chain: MarkovChain, random: Random, chars: number): string {
  let text = '';
  while (text.length < chars) {
    text += (text.length > 0 ? ' ' : '') + markovProse(chain, random, 60);
  }
  const cut = text.indexOf(' ', chars);
  return cut === -1 ? text : text.slice(0, cut);
}

/** A URL path slug: lowercase, hyphenated, ASCII-folded. */
export function slugify(words: readonly string[]): string {
  return words
    .join('-')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}
