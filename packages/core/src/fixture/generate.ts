import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { _resetUuidState, uuidv7 } from '../ids/uuid.js';
import type { Clock, Random } from '../ports/index.js';
import { systemClock, webRandom } from '../ports/index.js';
import {
  buildHosts, platformFor, sampleCreatedAt, sampleLang, zipf, type Platform,
} from './distributions.js';
import {
  buildTopicGeometry, docVector, FIXTURE_DIM, FIXTURE_MODEL_ID, FIXTURE_VEC_DIM, Gaussian,
  NOISE_FRACTION, unitVector,
} from './embeddings.js';
import { buildTagUniverse, sampleTagsFor, type TagUniverse } from './tags.js';
import {
  ChainCache, markovChars, markovProse, markovTitle, markovWords, slugify, type FixtureLang,
} from './text.js';
import { buildTopics, TOPIC_COUNT, type Topic } from './vocab.js';

// The fixture PLANNER (plans/TECHNICAL-DESIGN.md §8.2). Pure and runtime-agnostic: it yields rows,
// it never touches a database. The SQL half lives in packages/core/scripts/fixtureSql.ts, outside
// src/, because packages/core/test/no-direct-update.test.ts forbids raw inserts into a shareable
// table anywhere in src/ that is not ops/ or db/migrations/.

export type FixtureProfile = 'tiny' | 'ci' | 'scale';

export const PROFILE_COUNTS: Readonly<Record<FixtureProfile, number>> = {
  tiny: 200,
  ci: 10_000,
  scale: 100_000,
};

/** Documents that get a content version + 4 chunks: 10 % of the library, capped at the 10k
 *  "RAG subset" of §8.2 (which specifies scale only; 10 % keeps tiny and ci testable). */
export function ragSubsetSize(count: number): number {
  return Math.min(10_000, Math.ceil(count / 10));
}

export const CHUNKS_PER_DOC = 4;
export const CHUNK_CHARS = 600;

export interface FixtureOptions {
  profile: FixtureProfile;
  seed: number;
  clock?: Clock;
  random?: Random;
  onProgress?: (done: number, total: number, phase: string) => void;
}

export interface FixtureChunk {
  id: string;
  ord: number;
  headingPath: string;
  charStart: number;
  charEnd: number;
  tokenEst: number;
  text: string;
}

export interface FixtureContent {
  versionId: string;
  text: string;
  textHash: string;
  chunks: FixtureChunk[];
}

export interface FixtureDoc {
  index: number;
  id: string;
  url: string;
  urlNorm: string;
  urlHash: string;
  host: string;
  platform: Platform;
  lang: string;
  langKind: FixtureLang;
  topic: number;
  /** A 3 % uniform-noise point: no centroid, so clustering has genuine outliers. */
  noise: boolean;
  title: string;
  summary: string;
  summaryKind: 'none' | 'extractive' | 'llm' | 'imported';
  note: string;
  author: string | null;
  status: 'new' | 'ready' | 'partial' | 'failed';
  starred: boolean;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  /** Indices into TagUniverse.raw. */
  tags: number[];
  vec: Float32Array;
  content: FixtureContent | null;
}

export interface FixtureStats {
  profile: FixtureProfile;
  seed: number;
  bookmarks: number;
  tags: number;
  bookmarkTags: number;
  contentVersions: number;
  chunks: number;
  embeddings: number;
  vecRows: number;
  hosts: number;
  topics: number;
  canonicalTags: number;
  noisePoints: number;
  modelId: string;
  dim: number;
  vecDim: number;
  vecAvailable: boolean;
  elapsedMs: number;
  bytes: number;
  /** raw tag label → canonical concept. Also written to settings('fixture.tagTruth'). */
  tagTruth: Record<string, string>;
}

function hash32(s: string): string {
  return bytesToHex(blake3(utf8ToBytes(s))).slice(0, 32);
}

const PATH_PREFIX: readonly string[] = ['a', 'p', 'posts', 'notes', 'watch', 'r', 'doc', 'blog'];

export interface FixturePlan {
  profile: FixtureProfile;
  seed: number;
  count: number;
  ragDocs: number;
  topics: Topic[];
  hosts: string[];
  tagUniverse: TagUniverse;
  /** One UUIDv7 per raw tag, minted here so the SQL layer never touches the RNG stream. */
  tagIds: string[];
  docs(): Generator<FixtureDoc>;
}

/** Build the plan. The RNG stream is consumed in a fixed order — tag universe, topic geometry,
 *  then one document at a time — so the same seed yields the same library, byte for byte. */
export function planFixture(opts: FixtureOptions): FixturePlan {
  const clock = opts.clock ?? systemClock;
  const random = opts.random ?? webRandom;
  const count = PROFILE_COUNTS[opts.profile];
  const ragDocs = ragSubsetSize(count);

  _resetUuidState();

  const topics = buildTopics();
  const hosts = buildHosts();
  const hostZipf = zipf(hosts.length, 1.1);
  const tagUniverse = buildTagUniverse(random);
  const tagIds = tagUniverse.raw.map(() => uuidv7(clock, random));
  const geometry = buildTopicGeometry(random, TOPIC_COUNT, FIXTURE_DIM);
  const gauss = new Gaussian(random);
  const chains = new ChainCache();
  const nowMs = clock.now();

  function* docs(): Generator<FixtureDoc> {
    for (let i = 0; i < count; i++) {
      const topic = topics[Math.floor(random.float() * TOPIC_COUNT) % TOPIC_COUNT]!;
      const host = hosts[hostZipf.sample(random)]!;
      const lang = sampleLang(random);
      const chain = chains.get(topic, lang.kind);

      const title = markovTitle(chain, random);
      const summary = markovProse(chain, random, 24 + Math.floor(random.float() * 26));
      const slugWords = markovWords(chain, random, 3);
      const isPdf = random.float() < 0.03;
      const prefix = PATH_PREFIX[Math.floor(random.float() * PATH_PREFIX.length)]!;
      const path = `/${prefix}/${slugify(slugWords)}-${i.toString(36)}${isPdf ? '.pdf' : ''}`;
      const url = `https://${host}${path}`;
      const platform = platformFor(host, path);

      const createdMs = sampleCreatedAt(random, nowMs);
      const createdAt = new Date(createdMs).toISOString();
      const updatedAt = new Date(createdMs + Math.floor(random.float() * 86_400_000)).toISOString();

      const u = random.float();
      const status: FixtureDoc['status'] =
        u < 0.9 ? 'ready' : u < 0.95 ? 'new' : u < 0.98 ? 'partial' : 'failed';
      const confidence = status === 'ready' ? 70 + Math.floor(random.float() * 30)
        : Math.floor(random.float() * 60);

      const noise = random.float() < NOISE_FRACTION;
      const vec = noise
        ? unitVector(gauss, FIXTURE_DIM)
        : docVector(geometry.centroids[topic.index]!, geometry.sigmas[topic.index]!, gauss);

      const tags = sampleTagsFor(tagUniverse, topic.index, random);

      let content: FixtureContent | null = null;
      if (i < ragDocs) {
        const chunks: FixtureChunk[] = [];
        let cursor = 0;
        let text = '';
        for (let ord = 0; ord < CHUNKS_PER_DOC; ord++) {
          const body = markovChars(chain, random, CHUNK_CHARS);
          chunks.push({
            id: uuidv7(clock, random),
            ord,
            headingPath: `${title} > ${String(ord + 1)}`,
            charStart: cursor,
            charEnd: cursor + body.length,
            tokenEst: Math.ceil(body.length / 4),
            text: body,
          });
          text += (ord > 0 ? '\n\n' : '') + body;
          cursor += body.length + 2;
        }
        content = {
          versionId: uuidv7(clock, random),
          text,
          textHash: hash32(text),
          chunks,
        };
      }

      yield {
        index: i,
        id: uuidv7(clock, random),
        url,
        urlNorm: url,
        urlHash: hash32(url),
        host,
        platform,
        lang: lang.code,
        langKind: lang.kind,
        topic: topic.index,
        noise,
        title,
        summary,
        summaryKind: random.float() < 0.15 ? 'imported' : 'extractive',
        note: random.float() < 0.08 ? markovProse(chain, random, 12) : '',
        author: platform === 'youtube' || platform === 'twitter' || platform === 'threads'
          ? markovWords(chain, random, 2).join(' ')
          : null,
        status,
        starred: random.float() < 0.05,
        confidence,
        createdAt,
        updatedAt,
        tags,
        vec,
        content,
      };
    }
  }

  return {
    profile: opts.profile, seed: opts.seed, count, ragDocs, topics, hosts, tagUniverse, tagIds, docs,
  };
}

export { FIXTURE_DIM, FIXTURE_MODEL_ID, FIXTURE_VEC_DIM };
