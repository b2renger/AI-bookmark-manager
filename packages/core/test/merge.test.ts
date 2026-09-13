import { beforeEach, describe, expect, it } from 'vitest';
import { _resetUuidState, uuidv7 } from '../src/ids/uuid.js';
import { mergeEntity } from '../src/ops/merge.js';
import type { EntityState } from '../src/ops/types.js';
import { LIBRARY_COLLECTION_ID } from '../src/db/migrations/0001_init.js';
import { testDb, type TestDb } from './helpers/db.js';

const COLL = LIBRARY_COLLECTION_ID;

function hlcAt(ms: number, actor = 'Zremote1'): string {
  return `${ms.toString(36).padStart(10, '0')}.0000.${actor}`;
}

function bookmarkState(id: string, hlc: string, over: Record<string, unknown> = {}): EntityState {
  const base: Record<string, unknown> = {
    url: 'https://example.com/a',
    url_norm: 'example.com/a',
    url_hash: 'a'.repeat(32),
    title: 'From peer',
    ...over,
  };
  return {
    entity: 'bookmarks',
    id,
    collectionId: COLL,
    fields: Object.fromEntries(Object.entries(base).map(([k, v]) => [k, { v, hlc }])),
  };
}

function title(t: TestDb, id: string): unknown {
  return (t.raw.prepare('SELECT title FROM bookmarks WHERE id = ?').get(id) as { title: string })
    .title;
}

describe('mergeEntity', () => {
  let t: TestDb;
  let id: string;
  beforeEach(() => {
    _resetUuidState();
    t = testDb({ actorPubkey: '' });
    t.ctx.origin = 'bundle:cafebabe';
    id = uuidv7(t.ctx.clock, t.ctx.random);
    return () => t.close();
  });

  it('creates an unknown entity from a full field map and preserves the incoming HLCs', () => {
    const res = mergeEntity(t.ctx, bookmarkState(id, hlcAt(5_000_000)));
    expect(res.applied).toBeGreaterThan(0);
    expect(res.skipped).toBe(0);
    expect(title(t, id)).toBe('From peer');

    const frontier = t.raw
      .prepare("SELECT hlc FROM op_frontier WHERE entity_id = ? AND field = 'title'")
      .get(id) as { hlc: string };
    expect(frontier.hlc).toBe(hlcAt(5_000_000)); // verbatim, not re-minted
    const origins = t.raw
      .prepare('SELECT DISTINCT origin AS o FROM ops WHERE entity_id = ?')
      .all(id) as { o: string }[];
    expect(origins).toEqual([{ o: 'bundle:cafebabe' }]);
  });

  it('resolves conflicting field HLCs in favour of the higher one, whatever the order', () => {
    mergeEntity(t.ctx, bookmarkState(id, hlcAt(5_000_000)));

    const older = mergeEntity(t.ctx, {
      entity: 'bookmarks', id, collectionId: COLL,
      fields: { title: { v: 'older', hlc: hlcAt(1_000_000) } },
    });
    expect(older).toEqual({ applied: 0, skipped: 1 });
    expect(title(t, id)).toBe('From peer');

    const newer = mergeEntity(t.ctx, {
      entity: 'bookmarks', id, collectionId: COLL,
      fields: { title: { v: 'newer', hlc: hlcAt(9_000_000) } },
    });
    expect(newer).toEqual({ applied: 1, skipped: 0 });
    expect(title(t, id)).toBe('newer');
  });

  it('is idempotent: re-merging the same bundle applies nothing', () => {
    const state = bookmarkState(id, hlcAt(5_000_000));
    const fieldCount = Object.keys(state.fields).length;
    const first = mergeEntity(t.ctx, state);
    expect(first).toEqual({ applied: fieldCount + 1, skipped: 0 }); // one create + one set per field

    const again = mergeEntity(t.ctx, state);
    expect(again).toEqual({ applied: 0, skipped: fieldCount });
    expect(title(t, id)).toBe('From peer');
    // history keeps only what was applied, plus nothing new on the second pass
    expect(t.raw.prepare('SELECT count(*) AS n FROM ops WHERE entity_id = ?').get(id))
      .toEqual({ n: fieldCount + 1 });
  });

  it('resolves a tombstone against a concurrent edit by HLC, not by row existence', () => {
    mergeEntity(t.ctx, bookmarkState(id, hlcAt(5_000_000)));

    // peer A deletes at t=6, peer B renames at t=7: both land, the edit survives the tombstone
    const deleted = mergeEntity(t.ctx, {
      entity: 'bookmarks', id, collectionId: COLL,
      fields: {},
      deletedAt: { v: '2026-02-01T00:00:00.000Z', hlc: hlcAt(6_000_000) },
    });
    expect(deleted).toEqual({ applied: 1, skipped: 0 });
    expect(
      (t.raw.prepare('SELECT deleted_at AS d FROM bookmarks WHERE id = ?').get(id) as { d: string }).d,
    ).toBe('2026-02-01T00:00:00.000Z');

    const renamed = mergeEntity(t.ctx, {
      entity: 'bookmarks', id, collectionId: COLL,
      fields: { title: { v: 'renamed after delete', hlc: hlcAt(7_000_000) } },
    });
    expect(renamed).toEqual({ applied: 1, skipped: 0 });
    expect(title(t, id)).toBe('renamed after delete');

    // an older delete cannot re-tombstone, and a newer un-delete clears it
    expect(
      mergeEntity(t.ctx, {
        entity: 'bookmarks', id, collectionId: COLL, fields: {},
        deletedAt: { v: '2026-03-01T00:00:00.000Z', hlc: hlcAt(2_000_000) },
      }),
    ).toEqual({ applied: 0, skipped: 1 });

    mergeEntity(t.ctx, {
      entity: 'bookmarks', id, collectionId: COLL, fields: {},
      deletedAt: { v: null, hlc: hlcAt(8_000_000) },
    });
    expect(
      (t.raw.prepare('SELECT deleted_at AS d FROM bookmarks WHERE id = ?').get(id) as { d: null }).d,
    ).toBe(null);
  });

  it('advances the local HLC generator past everything it received', () => {
    mergeEntity(t.ctx, bookmarkState(id, hlcAt(9_000_000_000)));
    const mine = t.ctx.hlc.next();
    expect(mine > hlcAt(9_000_000_000)).toBe(true);
  });
});
