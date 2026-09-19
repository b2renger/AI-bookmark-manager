import { LIBRARY_COLLECTION_ID } from '../db/migrations/index.js';
import { uuidv7 } from '../ids/uuid.js';
import { applyOps } from '../ops/applyOp.js';
import type { OpContext, OpInput } from '../ops/types.js';
import { normalizeUrl } from '../url/normalize.js';
import type { SaveUrlsRequest, SaveUrlsResponse, SavedRefDto } from './dto.js';
import { detectPlatform } from './platform.js';
import { chunked } from './query.js';

// §5(a) steps 1–5 and 17, P0 shape: parse, normalise, dedupe, ONE applyOps transaction, done.
// No fetching, no embedding, no LLM — a saved URL lands with status 'new' and the fetch pipeline
// (P3) picks it up from there.

interface Candidate {
  raw: string;
  url: string;
  norm: string;
  hash: string;
  host: string;
  title?: string;
  createdAt?: string;
}

export function saveUrls(ctx: OpContext, request: SaveUrlsRequest): SaveUrlsResponse {
  const collectionId = request.collectionId ?? LIBRARY_COLLECTION_ID;
  const response: SaveUrlsResponse = { accepted: [], duplicates: [], rejected: [] };

  // 1–2. parse + normalise; an unparseable line is rejected, never silently dropped.
  const candidates: Candidate[] = [];
  const seen = new Map<string, string>(); // norm → the raw url that claimed it first
  for (const item of request.items) {
    let normalized;
    try {
      normalized = normalizeUrl(item.url);
    } catch (e) {
      response.rejected.push({
        url: item.url,
        reason: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    if (seen.has(normalized.norm)) {
      // A within-batch duplicate: `existingId` is filled in once the first copy has an id.
      response.duplicates.push({ url: item.url, existingId: '' });
      continue;
    }
    seen.set(normalized.norm, item.url);
    const candidate: Candidate = {
      raw: item.url,
      url: normalized.url,
      norm: normalized.norm,
      hash: normalized.hash,
      host: normalized.host,
    };
    if (item.title !== undefined) candidate.title = item.title;
    if (item.addDate !== undefined) candidate.createdAt = item.addDate;
    candidates.push(candidate);
  }

  // 3. dedupe against the library: one IN query per 500 hashes, never one per url.
  const existing = new Map<string, string>();
  for (const batch of chunked(candidates.map((c) => c.hash))) {
    const rows = ctx.db
      .prepare(
        `SELECT id, url_hash FROM bookmarks
          WHERE collection_id = ? AND deleted_at IS NULL
            AND url_hash IN (${batch.map(() => '?').join(',')})`,
      )
      .all<{ id: string; url_hash: string }>(collectionId, ...batch);
    for (const row of rows) existing.set(row.url_hash, row.id);
  }

  // 5. one transaction for the whole batch.
  const now = ctx.clock.iso();
  const ops: OpInput[] = [];
  const refs: SavedRefDto[] = [];
  /** norm → the id that now owns it, whether it was just created or already in the library. */
  const normToId = new Map<string, string>();

  for (const candidate of candidates) {
    const duplicate = existing.get(candidate.hash);
    if (duplicate !== undefined) {
      normToId.set(candidate.norm, duplicate);
      response.duplicates.push({ url: candidate.raw, existingId: duplicate });
      continue;
    }
    const id = uuidv7(ctx.clock, ctx.random);
    normToId.set(candidate.norm, id);
    ops.push({
      collectionId,
      entity: 'bookmarks',
      entityId: id,
      op: 'create',
      value: {
        url: candidate.url,
        url_norm: candidate.norm,
        url_hash: candidate.hash,
        title: candidate.title ?? candidate.host,
        platform: detectPlatform(candidate.url),
        status: 'new',
        created_at: candidate.createdAt ?? now,
        updated_at: now,
      },
    });
    refs.push({ id, url: candidate.url, urlNorm: candidate.norm });
  }

  if (ops.length > 0) applyOps(ctx, ops);
  response.accepted = refs;

  // Backfill the within-batch duplicates now that their twin has an id.
  for (const duplicate of response.duplicates) {
    if (duplicate.existingId !== '') continue;
    let norm: string | undefined;
    try {
      norm = normalizeUrl(duplicate.url).norm;
    } catch {
      continue;
    }
    duplicate.existingId = normToId.get(norm) ?? '';
  }
  return response;
}
