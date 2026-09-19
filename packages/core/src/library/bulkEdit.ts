import { LIBRARY_COLLECTION_ID } from '../db/migrations/index.js';
import { applyOps } from '../ops/applyOp.js';
import type { OpContext, OpInput } from '../ops/types.js';
import type { BulkEditRequest, BulkEditResponse } from './dto.js';
import { chunked } from './query.js';
import { createRun, finishRun } from './runs.js';
import { TagIndex } from './tags.js';

// library:bulkEdit (channel 6). Every change is stamped with a `runs` row so §3.8's undo has
// something to revert, and the whole batch is one transaction: a throw leaves nothing half-applied.

interface OwnerRow {
  id: string;
  collection_id: string;
}

export function bulkEdit(ctx: OpContext, request: BulkEditRequest): BulkEditResponse {
  const ids = [...new Set(request.ids)].filter((id) => id !== '');
  if (ids.length === 0) return { runId: '', changed: 0 };

  // The collection each bookmark belongs to: ops carry it, and a selection can span collections.
  const owners = new Map<string, string>();
  for (const batch of chunked(ids)) {
    const rows = ctx.db
      .prepare(
        `SELECT id, collection_id FROM bookmarks
          WHERE deleted_at IS NULL AND id IN (${batch.map(() => '?').join(',')})`,
      )
      .all<OwnerRow>(...batch);
    for (const row of rows) owners.set(row.id, row.collection_id);
  }
  if (owners.size === 0) return { runId: '', changed: 0 };

  const collectionId = owners.values().next().value ?? LIBRARY_COLLECTION_ID;
  const now = ctx.clock.iso();

  return ctx.db.transaction((): BulkEditResponse => {
    const runId = createRun(ctx, {
      collectionId,
      kind: 'bulkEdit',
      status: 'accepted',
      params: {
        ids: ids.length,
        addTags: request.addTags ?? [],
        removeTags: request.removeTags ?? [],
        ...(request.setCollection === undefined ? {} : { setCollection: request.setCollection }),
        ...(request.setStarred === undefined ? {} : { setStarred: request.setStarred }),
        ...(request.softDelete === undefined ? {} : { softDelete: request.softDelete }),
      },
    });

    const tags = TagIndex.load(ctx.db, collectionId, ctx.clock, ctx.random);
    const ops: OpInput[] = [];

    // addTags: find-or-create by label_norm, then link. The create op rides in the same batch.
    const addIds: string[] = [];
    for (const label of request.addTags ?? []) {
      if (label.trim() === '') continue;
      const { id, create } = tags.ensure(label);
      if (create) ops.push({ ...create, runId });
      addIds.push(id);
    }
    // removeTags: the drawer sends tag ids, the bulk bar sends labels — both resolve here.
    const removeIds: string[] = [];
    for (const labelOrId of request.removeTags ?? []) {
      const id = tags.resolve(labelOrId);
      if (id !== undefined) removeIds.push(id);
    }

    for (const [bookmarkId, owner] of owners) {
      for (const tagId of addIds) {
        ops.push({
          collectionId: owner,
          entity: 'bookmark_tags',
          entityId: bookmarkId,
          field: tagId,
          op: 'link',
          value: { tag_id: tagId, source: 'user', accepted: 1, created_at: now },
          runId,
        });
      }
      for (const tagId of removeIds) {
        ops.push({
          collectionId: owner,
          entity: 'bookmark_tags',
          entityId: bookmarkId,
          field: tagId,
          op: 'unlink',
          value: { tag_id: tagId },
          runId,
        });
      }
      if (request.setStarred !== undefined) {
        ops.push({
          collectionId: owner,
          entity: 'bookmarks',
          entityId: bookmarkId,
          field: 'starred',
          op: 'set',
          value: request.setStarred ? 1 : 0,
          runId,
        });
      }
      if (request.setCollection !== undefined) {
        ops.push({
          collectionId: owner,
          entity: 'bookmarks',
          entityId: bookmarkId,
          field: 'collection_id',
          op: 'set',
          value: request.setCollection,
          runId,
        });
      }
      if (request.softDelete === true) {
        ops.push({
          collectionId: owner,
          entity: 'bookmarks',
          entityId: bookmarkId,
          op: 'delete',
          value: now,
          runId,
        });
      }
    }

    const applied = applyOps(ctx, ops).filter((op) => op.applied).length;
    finishRun(ctx, runId, { items: ops.length, applied, bookmarks: owners.size });
    return { runId, changed: applied };
  })();
}
