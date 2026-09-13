import { applyOp } from './applyOp.js';
import { projectorFor } from './projectors.js';
import type { EntityState, FieldState, OpContext, OpInput } from './types.js';

// LWW merge for bundle import (plans/TECHNICAL-DESIGN.md §3.7). Per field: compare the incoming HLC
// against the frontier by plain string comparison; if it is greater, replay it through applyOp with
// the HLC preserved verbatim, so the same bundle applied twice is a no-op and two peers converge
// regardless of arrival order. Deletes are just the `deleted_at` field, which is why a tombstone and
// a concurrent edit resolve by HLC instead of by row existence.
//
// P9 deletes this file: `doc.import(bytes)` replaces it.

export interface MergeResult {
  applied: number;
  skipped: number;
}

function frontierHlc(ctx: OpContext, entity: string, id: string, field: string): string | null {
  const row = ctx.db
    .prepare('SELECT hlc FROM op_frontier WHERE entity = ? AND entity_id = ? AND field = ?')
    .get<{ hlc: string }>(entity, id, field);
  return row?.hlc ?? null;
}

function wins(ctx: OpContext, entity: string, id: string, field: string, hlc: string): boolean {
  const current = frontierHlc(ctx, entity, id, field);
  return current === null || hlc > current;
}

function rowExists(ctx: OpContext, entity: EntityState['entity'], id: string): boolean {
  const p = projectorFor(entity);
  return (
    ctx.db.prepare(`SELECT 1 AS x FROM ${p.table} WHERE ${p.idColumn} = ?`).get<{ x: number }>(id) !==
    undefined
  );
}

function run(ctx: OpContext, input: OpInput, out: MergeResult): void {
  const res = applyOp(ctx, input);
  if (res.applied) out.applied++;
  else out.skipped++;
}

export function mergeEntity(ctx: OpContext, incoming: EntityState): MergeResult {
  const out: MergeResult = { applied: 0, skipped: 0 };
  const { entity, id, collectionId } = incoming;
  const entries = Object.entries(incoming.fields) as [string, FieldState][];

  const apply = ctx.db.transaction(() => {
    // An unknown entity id arrives as `fields` carrying every column: seed the row with one
    // `create` stamped with the newest incoming HLC, then let the per-field loop below install the
    // per-field frontier entries. Re-merging the same bundle then skips everything.
    if (!rowExists(ctx, entity, id) && entries.length > 0) {
      const value: Record<string, unknown> = {};
      let createHlc = entries[0]![1].hlc;
      for (const [k, f] of entries) {
        value[k] = f.v;
        if (f.hlc > createHlc) createHlc = f.hlc;
      }
      if (incoming.deletedAt) value['deleted_at'] = incoming.deletedAt.v;
      if (wins(ctx, entity, id, '', createHlc)) {
        run(ctx, { collectionId, entity, entityId: id, op: 'create', value, hlc: createHlc }, out);
      }
    }

    for (const [field, state] of entries) {
      if (!wins(ctx, entity, id, field, state.hlc)) {
        out.skipped++;
        continue;
      }
      run(
        ctx,
        { collectionId, entity, entityId: id, field, op: 'set', value: state.v, hlc: state.hlc },
        out,
      );
    }

    const tomb = incoming.deletedAt;
    if (tomb) {
      if (!wins(ctx, entity, id, 'deleted_at', tomb.hlc)) out.skipped++;
      else if (tomb.v === null || tomb.v === undefined) {
        run(
          ctx,
          {
            collectionId, entity, entityId: id, field: 'deleted_at',
            op: 'set', value: null, hlc: tomb.hlc,
          },
          out,
        );
      } else {
        run(
          ctx,
          {
            collectionId, entity, entityId: id, field: 'deleted_at',
            op: 'delete', value: tomb.v, hlc: tomb.hlc,
          },
          out,
        );
      }
    }
  });

  apply();
  return out;
}
