import { LIBRARY_COLLECTION_ID } from '../db/migrations/index.js';
import { uuidv7 } from '../ids/uuid.js';
import { chunked } from '../library/query.js';
import { createRun, finishRun } from '../library/runs.js';
import { detectPlatform } from '../library/platform.js';
import { TagIndex } from '../library/tags.js';
import { applyOps } from '../ops/applyOp.js';
import type { OpContext, OpInput } from '../ops/types.js';
import type { DbHandle } from '../ports/index.js';
import { ftsRebuild, ftsSetTriggers } from '../search/fts.js';
import { normalizeUrl } from '../url/normalize.js';
import type { BookmarkDraft, MalformedRow } from './types.js';

// The two halves of P0 task 13: "import inside one db.transaction() with a dedupe report rendered
// BEFORE commit". `previewImport` is read-only and produces the report; `commitImport` writes.
//
// Folder handling, decided here and documented for the UI: each segment of `folderPath` becomes an
// import tag of its own (`Veille`, `IA`), not one `folder:Veille / IA` tag. Segments are what users
// filter by, they merge across sources, and they survive a re-organisation of the tree.

/** A draft that has been normalised and hashed — the unit `commitImport` writes. */
export interface PreparedDraft {
  draft: BookmarkDraft;
  url: string;
  norm: string;
  hash: string;
  host: string;
}

export interface ImportSampleRow {
  url: string;
  title: string | null;
  tags: string[];
  folderPath: string | null;
  createdAt: string | null;
}

export interface ImportPreview {
  total: number;
  newCount: number;
  duplicateCount: number;
  malformedCount: number;
  /** First 50 only; the full report lives in the run. */
  duplicates: { url: string; existingId: string }[];
  malformed: { raw: string; reason: string }[];
  sample: ImportSampleRow[];
  /** Held in memory by the host, keyed by previewId, until commit or TTL. */
  drafts: PreparedDraft[];
}

export interface PreviewOptions {
  /** Rows the parser could not read at all. Counted, never written. */
  malformed?: readonly MalformedRow[];
}

const SAMPLE_SIZE = 50;
export const COMMIT_BATCH_SIZE = 2000;

function sampleRow(prepared: PreparedDraft): ImportSampleRow {
  const d = prepared.draft;
  return {
    url: prepared.url,
    title: d.title ?? null,
    tags: d.tags ?? [],
    folderPath: d.folderPath?.length ? d.folderPath.join(' / ') : null,
    createdAt: d.createdAt ?? null,
  };
}

export function previewImport(
  db: DbHandle,
  drafts: readonly BookmarkDraft[],
  collectionId: string = LIBRARY_COLLECTION_ID,
  opts: PreviewOptions = {},
): ImportPreview {
  const parserMalformed = opts.malformed ?? [];
  const malformed: { raw: string; reason: string }[] = parserMalformed
    .slice(0, SAMPLE_SIZE)
    .map((m) => ({ raw: m.raw, reason: m.reason }));
  let malformedCount = parserMalformed.length;

  // Normalise + dedupe within the batch (first wins).
  const prepared: PreparedDraft[] = [];
  const seen = new Set<string>();
  const batchDuplicates: { url: string; norm: string }[] = [];

  for (const draft of drafts) {
    let normalized;
    try {
      normalized = normalizeUrl(draft.url);
    } catch (e) {
      malformedCount += 1;
      if (malformed.length < SAMPLE_SIZE) {
        malformed.push({ raw: draft.url, reason: e instanceof Error ? e.message : String(e) });
      }
      continue;
    }
    if (seen.has(normalized.norm)) {
      batchDuplicates.push({ url: draft.url, norm: normalized.norm });
      continue;
    }
    seen.add(normalized.norm);
    prepared.push({
      draft,
      url: normalized.url,
      norm: normalized.norm,
      hash: normalized.hash,
      host: normalized.host,
    });
  }

  // Dedupe against the library: one IN query per 500 hashes.
  const existing = new Map<string, string>();
  for (const batch of chunked(prepared.map((p) => p.hash))) {
    const rows = db
      .prepare(
        `SELECT id, url_hash FROM bookmarks
          WHERE collection_id = ? AND deleted_at IS NULL
            AND url_hash IN (${batch.map(() => '?').join(',')})`,
      )
      .all<{ id: string; url_hash: string }>(collectionId, ...batch);
    for (const row of rows) existing.set(row.url_hash, row.id);
  }

  const fresh: PreparedDraft[] = [];
  const duplicates: { url: string; existingId: string }[] = [];
  let duplicateCount = 0;
  const normToId = new Map<string, string>();

  for (const p of prepared) {
    const hit = existing.get(p.hash);
    if (hit !== undefined) {
      duplicateCount += 1;
      normToId.set(p.norm, hit);
      if (duplicates.length < SAMPLE_SIZE) duplicates.push({ url: p.draft.url, existingId: hit });
      continue;
    }
    fresh.push(p);
  }
  for (const d of batchDuplicates) {
    duplicateCount += 1;
    if (duplicates.length < SAMPLE_SIZE) {
      duplicates.push({ url: d.url, existingId: normToId.get(d.norm) ?? '' });
    }
  }

  return {
    total: drafts.length + parserMalformed.length,
    newCount: fresh.length,
    duplicateCount,
    malformedCount,
    duplicates,
    malformed,
    sample: fresh.slice(0, SAMPLE_SIZE).map(sampleRow),
    drafts: fresh,
  };
}

export interface CommitProgress {
  phase: 'inserting' | 'indexing';
  done: number;
  total: number;
}

export interface CommitOptions {
  collectionId?: string;
  runId?: string;
  batchSize?: number;
  onProgress?: (progress: CommitProgress) => void;
}

export interface CommitResult {
  inserted: number;
  skipped: number;
  runId: string;
}

/** The draft's non-empty extras, folded into `note` so nothing the parser found is lost. */
function noteFor(draft: BookmarkDraft): string {
  const parts: string[] = [];
  if (draft.note) parts.push(draft.note);
  if (draft.extra && Object.keys(draft.extra).length > 0) parts.push(JSON.stringify(draft.extra));
  return parts.join('\n\n');
}

export function commitImport(
  ctx: OpContext,
  prepared: readonly PreparedDraft[],
  opts: CommitOptions = {},
): CommitResult {
  const collectionId = opts.collectionId ?? LIBRARY_COLLECTION_ID;
  const batchSize = opts.batchSize ?? COMMIT_BATCH_SIZE;
  const now = ctx.clock.iso();
  const runId =
    opts.runId ??
    createRun(ctx, {
      collectionId,
      kind: 'import',
      status: 'accepted',
      params: { drafts: prepared.length },
    });

  const tags = TagIndex.load(ctx.db, collectionId, ctx.clock, ctx.random);
  let inserted = 0;
  let skipped = 0;

  // The FTS triggers fire six times per bookmark row; dropping them for the duration and
  // rebuilding once at the end is what keeps 100k inside the budget (§3.2).
  ftsSetTriggers(ctx.db, false);
  try {
    for (let start = 0; start < prepared.length; start += batchSize) {
      const batch = prepared.slice(start, start + batchSize);
      const ops: OpInput[] = [];

      for (const p of batch) {
        const draft = p.draft;
        const id = uuidv7(ctx.clock, ctx.random);
        const note = noteFor(draft);
        ops.push({
          collectionId,
          entity: 'bookmarks',
          entityId: id,
          op: 'create',
          runId,
          value: {
            url: p.url,
            url_norm: p.norm,
            url_hash: p.hash,
            title: draft.title ?? p.host,
            summary: draft.summary ?? '',
            summary_kind: draft.summary ? 'imported' : 'none',
            author: draft.author ?? null,
            platform: detectPlatform(p.url),
            note,
            status: 'new',
            created_at: draft.createdAt ?? now,
            updated_at: now,
          },
        });

        // Explicit tags first, then one tag per folder segment (see the header note).
        const labels = [...(draft.tags ?? []), ...(draft.folderPath ?? [])];
        const linked = new Set<string>();
        for (const label of labels) {
          if (label.trim() === '') continue;
          const { id: tagId, create } = tags.ensure(label);
          if (create) ops.push({ ...create, runId });
          if (linked.has(tagId)) continue;
          linked.add(tagId);
          ops.push({
            collectionId,
            entity: 'bookmark_tags',
            entityId: id,
            field: tagId,
            op: 'link',
            runId,
            value: { tag_id: tagId, source: 'import', accepted: 1, created_at: now },
          });
        }
      }

      const applied = applyOps(ctx, ops);
      for (let i = 0; i < ops.length; i++) {
        if (ops[i]!.entity !== 'bookmarks' || ops[i]!.op !== 'create') continue;
        if (applied[i]!.applied) inserted += 1;
        else skipped += 1;
      }
      opts.onProgress?.({ phase: 'inserting', done: inserted + skipped, total: prepared.length });
    }
  } finally {
    ftsSetTriggers(ctx.db, true);
  }

  opts.onProgress?.({ phase: 'indexing', done: prepared.length, total: prepared.length });
  ftsRebuild(ctx.db);
  finishRun(ctx, runId, { inserted, skipped });
  return { inserted, skipped, runId };
}
