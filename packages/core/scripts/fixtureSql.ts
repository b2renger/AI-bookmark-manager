import { LIBRARY_COLLECTION_ID } from '../src/db/migrations/index.js';
import { ensureVecTables, vecAvailable } from '../src/db/vec.js';
import { FIXTURE_DIM, FIXTURE_MODEL_ID, FIXTURE_VEC_DIM, toFloat32LeBlob, truncateRenormalise } from '../src/fixture/embeddings.js';
import { planFixture, type FixtureDoc, type FixtureOptions, type FixtureStats } from '../src/fixture/generate.js';
import { systemClock, type Clock, type DbHandle, type Statement } from '../src/ports/index.js';
import { ftsRebuild, ftsSetTriggers } from '../src/search/fts.js';

// The SQL half of the fixture generator (plans/TECHNICAL-DESIGN.md §8.2). It lives under scripts/
// rather than src/ on purpose: packages/core/test/no-direct-update.test.ts forbids a raw
// `INSERT INTO bookmarks` anywhere in src/ outside ops/ and db/migrations/, and a fixture is not
// user data — routing 100k synthetic rows through the op log would take minutes and prove nothing.

/** One transaction per 5,000 documents (§8.2). */
export const BATCH_SIZE = 5_000;

const BOOKMARK_SQL = `INSERT INTO bookmarks
 (id,collection_id,url,url_norm,url_hash,title,summary,summary_kind,summary_model_id,author,
  platform,lang,note,status,starred,open_count,confidence,confidence_reason,acquisition_method,
  current_version_id,created_at,updated_at)
 VALUES (?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

const VERSION_SQL = `INSERT INTO content_versions
 (id,bookmark_id,fetched_at,method,tier,http_status,final_url,lang,title,text,text_hash,byte_len,
  confidence,confidence_reason,extractor_version)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

const CHUNK_SQL = `INSERT INTO chunks
 (id,bookmark_id,version_id,ord,heading_path,char_start,char_end,token_est,text)
 VALUES (?,?,?,?,?,?,?,?,?)`;

const EMBED_SQL = `INSERT INTO embeddings (owner_type,owner_id,model_id,dim,vec,created_at)
 VALUES ('bookmark',?,?,?,?,?)`;

const TAG_SQL = `INSERT INTO tags (id,collection_id,label,label_norm,usage_count,created_at,updated_at)
 VALUES (?,?,?,?,0,?,?)`;

const BOOKMARK_TAG_SQL =
  `INSERT INTO bookmark_tags (bookmark_id,tag_id,source,accepted,score,created_at) VALUES (?,?,?,1,?,?)`;

const TAG_COUNT_SQL = `UPDATE tags SET usage_count = ? WHERE id = ?`;

const SETTING_SQL = `INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)
 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`;

const VEC_MAP_SQL = `INSERT INTO vec_doc_map (rowid,bookmark_id,model_id,built_at) VALUES (?,?,?,?)`;
const VEC_DOC_SQL = `INSERT INTO vec_docs (rowid,embedding) VALUES (?,?)`;

interface Prepared {
  bookmark: Statement;
  version: Statement;
  chunk: Statement;
  embed: Statement;
  bookmarkTag: Statement;
  vecMap: Statement | null;
  vecDoc: Statement | null;
}

/** Populate `db` (already migrated) with a deterministic synthetic library. */
export function generateFixture(db: DbHandle, opts: FixtureOptions): FixtureStats {
  const started = Date.now();
  const clock: Clock = opts.clock ?? systemClock;
  const nowIso = clock.iso();
  const progress = opts.onProgress ?? ((): void => {});

  const plan = planFixture(opts);
  const vec = vecAvailable(db);
  if (vec) ensureVecTables(db, FIXTURE_VEC_DIM);

  ftsSetTriggers(db, false);

  // ── tags ────────────────────────────────────────────────────────────────────────────────
  progress(0, plan.tagUniverse.raw.length, 'tags');
  const tagIds = plan.tagIds;
  const insertTags = db.transaction(() => {
    const st = db.prepare(TAG_SQL);
    for (let i = 0; i < plan.tagUniverse.raw.length; i++) {
      const t = plan.tagUniverse.raw[i]!;
      st.run(tagIds[i]!, LIBRARY_COLLECTION_ID, t.label, t.norm, nowIso, nowIso);
    }
  });
  insertTags();
  progress(plan.tagUniverse.raw.length, plan.tagUniverse.raw.length, 'tags');

  const p: Prepared = {
    bookmark: db.prepare(BOOKMARK_SQL),
    version: db.prepare(VERSION_SQL),
    chunk: db.prepare(CHUNK_SQL),
    embed: db.prepare(EMBED_SQL),
    bookmarkTag: db.prepare(BOOKMARK_TAG_SQL),
    vecMap: vec ? db.prepare(VEC_MAP_SQL) : null,
    vecDoc: vec ? db.prepare(VEC_DOC_SQL) : null,
  };

  const counts = {
    bookmarks: 0, bookmarkTags: 0, contentVersions: 0, chunks: 0, embeddings: 0, vecRows: 0,
    noise: 0,
  };
  const usage = new Map<number, number>();

  const writeBatch = db.transaction((batch: FixtureDoc[]) => {
    for (const doc of batch) {
      p.bookmark.run(
        doc.id, LIBRARY_COLLECTION_ID, doc.url, doc.urlNorm, doc.urlHash, doc.title, doc.summary,
        doc.summaryKind, doc.author, doc.platform, doc.lang, doc.note, doc.status,
        doc.starred ? 1 : 0, 0, doc.confidence, 'fixture', 'fixture',
        doc.content ? doc.content.versionId : null, doc.createdAt, doc.updatedAt,
      );
      counts.bookmarks++;
      if (doc.noise) counts.noise++;

      p.embed.run(doc.id, FIXTURE_MODEL_ID, FIXTURE_DIM, toFloat32LeBlob(doc.vec), doc.createdAt);
      counts.embeddings++;

      if (p.vecMap && p.vecDoc) {
        // sqlite-vec rejects a REAL-bound rowid, and better-sqlite3 binds JS numbers as doubles.
        const rowid = BigInt(counts.bookmarks);
        p.vecMap.run(rowid, doc.id, FIXTURE_MODEL_ID, nowIso);
        p.vecDoc.run(rowid, toFloat32LeBlob(truncateRenormalise(doc.vec, FIXTURE_VEC_DIM)));
        counts.vecRows++;
      }

      if (doc.content) {
        p.version.run(
          doc.content.versionId, doc.id, doc.createdAt, 'fixture', 1, 200, doc.url, doc.lang,
          doc.title, doc.content.text, doc.content.textHash, doc.content.text.length,
          doc.confidence, 'fixture', 'fixture-1',
        );
        counts.contentVersions++;
        for (const c of doc.content.chunks) {
          p.chunk.run(
            c.id, doc.id, doc.content.versionId, c.ord, c.headingPath,
            c.charStart, c.charEnd, c.tokenEst, c.text,
          );
          counts.chunks++;
        }
      }

      for (const tagIdx of doc.tags) {
        p.bookmarkTag.run(doc.id, tagIds[tagIdx]!, 'import', 0.5 + doc.confidence / 200, doc.createdAt);
        counts.bookmarkTags++;
        usage.set(tagIdx, (usage.get(tagIdx) ?? 0) + 1);
      }
    }
  });

  let batch: FixtureDoc[] = [];
  for (const doc of plan.docs()) {
    batch.push(doc);
    if (batch.length === BATCH_SIZE) {
      writeBatch(batch);
      batch = [];
      progress(counts.bookmarks, plan.count, 'bookmarks');
    }
  }
  if (batch.length > 0) {
    writeBatch(batch);
    progress(counts.bookmarks, plan.count, 'bookmarks');
  }

  // ── usage counts + the answer key ───────────────────────────────────────────────────────
  const bumpUsage = db.transaction(() => {
    const st = db.prepare(TAG_COUNT_SQL);
    for (const [idx, n] of usage) st.run(n, tagIds[idx]!);
  });
  bumpUsage();

  const stats: FixtureStats = {
    profile: plan.profile,
    seed: plan.seed,
    bookmarks: counts.bookmarks,
    tags: plan.tagUniverse.raw.length,
    bookmarkTags: counts.bookmarkTags,
    contentVersions: counts.contentVersions,
    chunks: counts.chunks,
    embeddings: counts.embeddings,
    vecRows: counts.vecRows,
    hosts: plan.hosts.length,
    topics: plan.topics.length,
    canonicalTags: plan.tagUniverse.canonicals.length,
    noisePoints: counts.noise,
    modelId: FIXTURE_MODEL_ID,
    dim: FIXTURE_DIM,
    vecDim: FIXTURE_VEC_DIM,
    vecAvailable: vec,
    elapsedMs: 0,
    bytes: 0,
    tagTruth: plan.tagUniverse.truth,
  };

  progress(0, 1, 'fts');
  ftsSetTriggers(db, true);
  ftsRebuild(db);
  progress(1, 1, 'fts');

  stats.elapsedMs = Date.now() - started;

  // The answer key travels inside the file, so a generated .db is self-describing.
  const meta: Record<string, unknown> = { ...stats };
  delete meta['tagTruth'];
  const settings = db.prepare(SETTING_SQL);
  const writeSettings = db.transaction(() => {
    settings.run('fixture.tagTruth', JSON.stringify(plan.tagUniverse.truth), nowIso);
    settings.run('fixture.meta', JSON.stringify(meta), nowIso);
  });
  writeSettings();

  return stats;
}
