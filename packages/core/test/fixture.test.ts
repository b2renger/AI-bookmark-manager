import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateFixture } from '../scripts/fixtureSql.js';
import {
  CHUNKS_PER_DOC, FIXTURE_DIM, FIXTURE_MODEL_ID, PROFILE_COUNTS, ragSubsetSize,
} from '../src/fixture/generate.js';
import { fromFloat32LeBlob, norm } from '../src/fixture/embeddings.js';
import { buildFtsQuery, ftsSearchBookmarks } from '../src/search/fts.js';
import type { DbHandle } from '../src/ports/index.js';
import { frozenClock } from './helpers/clock.js';
import { testDb, type TestDb } from './helpers/db.js';
import { seededRandom } from './helpers/random.js';

// plans/TECHNICAL-DESIGN.md §8.2. The `tiny` profile is the fast, reviewable end of the same
// generator that produces the 100k scale fixture, so asserting on it asserts on both.

const SEED = 42;
const TINY = PROFILE_COUNTS.tiny;

function build(seed: number): TestDb {
  const t = testDb({ vec: true });
  generateFixture(t.db, {
    profile: 'tiny',
    seed,
    clock: frozenClock('2026-01-01T00:00:00.000Z'),
    random: seededRandom(seed),
  });
  return t;
}

function urlHashes(db: DbHandle): string[] {
  return db
    .prepare('SELECT url_hash AS h FROM bookmarks ORDER BY url_hash')
    .all<{ h: string }>()
    .map((r) => r.h);
}

function firstVecs(db: DbHandle, n: number): string[] {
  return db
    .prepare('SELECT hex(vec) AS x FROM embeddings ORDER BY owner_id LIMIT ?')
    .all<{ x: string }>(n)
    .map((r) => r.x);
}

describe('fixture generator — tiny profile', () => {
  let t: TestDb;

  beforeAll(() => {
    t = build(SEED);
  });
  afterAll(() => {
    t.close();
  });

  it('inserts exactly the profile count of bookmarks, all in the library collection', () => {
    const row = t.db
      .prepare('SELECT count(*) AS n, count(DISTINCT collection_id) AS c FROM bookmarks')
      .get<{ n: number; c: number }>();
    expect(row?.n).toBe(TINY);
    expect(row?.c).toBe(1);
  });

  it('gives every bookmark one 768-d unit embedding under the fixture model id', () => {
    const rows = t.db
      .prepare('SELECT owner_id AS id, model_id AS m, dim AS d, vec AS v FROM embeddings')
      .all<{ id: string; m: string; d: number; v: Uint8Array }>();
    expect(rows).toHaveLength(TINY);
    for (const r of rows) {
      expect(r.m).toBe(FIXTURE_MODEL_ID);
      expect(r.d).toBe(FIXTURE_DIM);
      expect(r.v.length).toBe(FIXTURE_DIM * 4);
      expect(norm(fromFloat32LeBlob(r.v))).toBeCloseTo(1, 4);
    }
    const orphans = t.db
      .prepare(
        `SELECT count(*) AS n FROM bookmarks b
          WHERE NOT EXISTS (SELECT 1 FROM embeddings e WHERE e.owner_id = b.id)`,
      )
      .get<{ n: number }>();
    expect(orphans?.n).toBe(0);
  });

  it('mirrors the embeddings into vec_docs when sqlite-vec is available', () => {
    if (!t.vec) return;
    const n = t.db.prepare('SELECT count(*) AS n FROM vec_doc_map').get<{ n: number }>();
    expect(n?.n).toBe(TINY);
  });

  it('chunks the RAG subset into four ~600-char chunks per content version', () => {
    const rag = ragSubsetSize(TINY);
    const cv = t.db.prepare('SELECT count(*) AS n FROM content_versions').get<{ n: number }>();
    const ch = t.db
      .prepare('SELECT count(*) AS n, min(length(text)) AS mn, max(length(text)) AS mx FROM chunks')
      .get<{ n: number; mn: number; mx: number }>();
    expect(cv?.n).toBe(rag);
    expect(ch?.n).toBe(rag * CHUNKS_PER_DOC);
    expect(ch?.mn).toBeGreaterThanOrEqual(600);
    expect(ch?.mx).toBeLessThan(700);
    const fts = t.db.prepare('SELECT count(*) AS n FROM chunks_fts').get<{ n: number }>();
    expect(fts?.n).toBe(rag * CHUNKS_PER_DOC);
  });

  it('spreads hosts, platforms, languages and 12 years of dates', () => {
    const hosts = t.db.prepare('SELECT count(DISTINCT url) AS n FROM bookmarks').get<{ n: number }>();
    expect(hosts?.n).toBe(TINY);
    const langs = t.db
      .prepare('SELECT count(DISTINCT lang) AS n FROM bookmarks')
      .get<{ n: number }>();
    expect(langs?.n).toBeGreaterThanOrEqual(3);
    const platforms = t.db
      .prepare('SELECT count(DISTINCT platform) AS n FROM bookmarks')
      .get<{ n: number }>();
    expect(platforms?.n).toBeGreaterThanOrEqual(4);
    const span = t.db
      .prepare('SELECT min(created_at) AS lo, max(created_at) AS hi FROM bookmarks')
      .get<{ lo: string; hi: string }>();
    expect(Date.parse(span!.hi) - Date.parse(span!.lo)).toBeGreaterThan(4 * 365 * 86_400_000);
  });

  it('persists the tag ground truth as settings(fixture.tagTruth), consistent with tags', () => {
    const row = t.db
      .prepare("SELECT value AS v FROM settings WHERE key = 'fixture.tagTruth'")
      .get<{ v: string }>();
    expect(row).toBeDefined();
    const truth = JSON.parse(row!.v) as Record<string, string>;
    const keys = Object.keys(truth);
    expect(keys.length).toBeGreaterThan(5_000);

    const labels = t.db.prepare('SELECT label AS l FROM tags').all<{ l: string }>().map((r) => r.l);
    expect(labels).toHaveLength(keys.length);
    for (const l of labels) expect(truth[l]).toBeDefined();

    // Every canonical is itself a raw tag, and there are far fewer canonicals than raw tags.
    const canonicals = new Set(Object.values(truth));
    expect(canonicals.size).toBeLessThan(keys.length);
    expect(canonicals.size).toBeGreaterThan(500);
  });

  it('finds accented French text through the diacritic-folding FTS index', () => {
    expect(ftsSearchBookmarks(t.db, 'cafe', { limit: 50 }).length).toBeGreaterThan(0);
    expect(ftsSearchBookmarks(t.db, buildFtsQuery('café'), { limit: 50 }).length).toBeGreaterThan(0);
    expect(ftsSearchBookmarks(t.db, buildFtsQuery('résumé'), { limit: 50 }).length).toBeGreaterThan(0);
  });
});

describe('fixture generator — determinism', () => {
  it('same seed ⇒ identical url_hash set and byte-identical embeddings', () => {
    const a = build(SEED);
    const b = build(SEED);
    try {
      expect(urlHashes(a.db)).toEqual(urlHashes(b.db));
      expect(firstVecs(a.db, 10)).toEqual(firstVecs(b.db, 10));
      const textHashes = (t: TestDb): string[] =>
        t.db
          .prepare('SELECT text_hash AS h FROM content_versions ORDER BY text_hash')
          .all<{ h: string }>()
          .map((r) => r.h);
      expect(textHashes(a)).toEqual(textHashes(b));
    } finally {
      a.close();
      b.close();
    }
  });

  it('a different seed ⇒ a different library', () => {
    const a = build(SEED);
    const c = build(SEED + 1);
    try {
      expect(urlHashes(a.db)).not.toEqual(urlHashes(c.db));
      expect(firstVecs(a.db, 10)).not.toEqual(firstVecs(c.db, 10));
    } finally {
      a.close();
      c.close();
    }
  });
});
