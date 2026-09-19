import { uuidv7 } from '../ids/uuid.js';
import type { OpContext } from '../ops/types.js';

// `runs` is the undo unit (§3.8). It is NOT a shareable table — it never travels between peers —
// so it is written with plain SQL; the no-direct-update guard's list is the shareable set only.

export const RUN_TTL_DAYS = 30;

export interface CreateRunInput {
  collectionId: string;
  kind: string;
  status?: 'planned' | 'running' | 'proposed' | 'partial' | 'accepted' | 'rejected' | 'reverted'
    | 'expired' | 'failed';
  params?: unknown;
  stats?: unknown;
  ttlDays?: number;
}

/** Inserts a run row and returns its id. P0 writes runs already `accepted`: bulk edits and
 *  imports apply immediately, the review queue (P4) is what introduces `proposed`. */
export function createRun(ctx: OpContext, input: CreateRunInput): string {
  const id = uuidv7(ctx.clock, ctx.random);
  const startedAt = ctx.clock.iso();
  const ttl = input.ttlDays ?? RUN_TTL_DAYS;
  const expiresAt = new Date(ctx.clock.now() + ttl * 86_400_000).toISOString();

  ctx.db
    .prepare(
      `INSERT INTO runs (id, collection_id, kind, status, params, stats, started_at, expires_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      input.collectionId,
      input.kind,
      input.status ?? 'accepted',
      JSON.stringify(input.params ?? {}),
      JSON.stringify(input.stats ?? {}),
      startedAt,
      expiresAt,
    );
  return id;
}

/** Closes a run: `finished_at` plus the final stats blob. */
export function finishRun(ctx: OpContext, runId: string, stats: unknown): void {
  ctx.db
    .prepare('UPDATE runs SET finished_at = ?, stats = ? WHERE id = ?')
    .run(ctx.clock.iso(), JSON.stringify(stats ?? {}), runId);
}
