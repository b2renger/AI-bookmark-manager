import { beforeEach, describe, expect, it } from 'vitest';
import { _resetUuidState, uuidv7 } from '../src/ids/uuid.js';
import { applyOp, applyOps } from '../src/ops/applyOp.js';
import { MUTATION_TABLES } from '../src/ops/projectors.js';
import { SHAREABLE_ENTITIES, type OpContext } from '../src/ops/types.js';
import { LIBRARY_COLLECTION_ID } from '../src/db/migrations/0001_init.js';
import { testDb, type TestDb } from './helpers/db.js';

const COLL = LIBRARY_COLLECTION_ID;

function hlcAt(ms: number, counter = 0, actor = 'AAAAAAAA'): string {
  return `${ms.toString(36).padStart(10, '0')}.${counter.toString(36).padStart(4, '0')}.${actor}`;
}

let seq = 0;
function newBookmark(t: TestDb): string {
  const id = uuidv7(t.ctx.clock, t.ctx.random);
  seq += 1;
  applyOp(t.ctx, {
    collectionId: COLL,
    entity: 'bookmarks',
    entityId: id,
    op: 'create',
    value: {
      url: `https://example.com/${seq}`,
      url_norm: `example.com/${seq}`,
      url_hash: String(seq).padStart(32, '0'),
      title: 'Original',
    },
  });
  return id;
}

function newTag(t: TestDb, label: string): string {
  const id = uuidv7(t.ctx.clock, t.ctx.random);
  applyOp(t.ctx, {
    collectionId: COLL,
    entity: 'tags',
    entityId: id,
    op: 'create',
    value: { label, label_norm: label.toLowerCase() },
  });
  return id;
}

function row(t: TestDb, table: string, id: string): Record<string, unknown> {
  return t.raw.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown>;
}

function ops(t: TestDb, entityId: string): Record<string, unknown>[] {
  return t.raw
    .prepare('SELECT * FROM ops WHERE entity_id = ? ORDER BY hlc')
    .all(entityId) as Record<string, unknown>[];
}

describe('applyOp', () => {
  let t: TestDb;
  beforeEach(() => {
    _resetUuidState();
    seq = 0;
    t = testDb();
    return () => t.close();
  });

  it('exports the shareable set as MUTATION_TABLES', () => {
    expect(MUTATION_TABLES).toEqual(SHAREABLE_ENTITIES);
  });

  it('create → set → delete on a bookmark', () => {
    const id = newBookmark(t);
    expect(row(t, 'bookmarks', id)['title']).toBe('Original');
    expect(row(t, 'bookmarks', id)['collection_id']).toBe(COLL);
    expect(row(t, 'bookmarks', id)['created_at']).toBe(t.clock.iso());

    t.clock.tick(1000);
    const set = applyOp(t.ctx, {
      collectionId: COLL, entity: 'bookmarks', entityId: id, field: 'title', op: 'set',
      value: 'Renamed',
    });
    expect(set.applied).toBe(true);
    expect(row(t, 'bookmarks', id)['title']).toBe('Renamed');
    expect(row(t, 'bookmarks', id)['updated_at']).toBe(t.clock.iso());

    t.clock.tick(1000);
    const del = applyOp(t.ctx, {
      collectionId: COLL, entity: 'bookmarks', entityId: id, op: 'delete',
    });
    expect(del.applied).toBe(true);
    expect(row(t, 'bookmarks', id)['deleted_at']).toBe(t.clock.iso());

    const log = ops(t, id);
    expect(log.map((o) => o['op'])).toEqual(['create', 'set', 'delete']);
    expect(log.every((o) => o['applied'] === 1)).toBe(true);
    expect(log.map((o) => o['field'])).toEqual([null, 'title', 'deleted_at']);

    const frontier = t.raw
      .prepare('SELECT field, hlc FROM op_frontier WHERE entity_id = ? ORDER BY field')
      .all(id) as { field: string }[];
    expect(frontier.map((f) => f.field)).toEqual(['', 'deleted_at', 'title']);
  });

  it('captures the inverse of every op kind', () => {
    const id = newBookmark(t);
    applyOp(t.ctx, {
      collectionId: COLL, entity: 'bookmarks', entityId: id, field: 'title', op: 'set',
      value: 'Renamed',
    });
    const log = ops(t, id);
    expect(JSON.parse(String(log[0]!['inverse']))).toBe(null); // create over nothing
    expect(JSON.parse(String(log[1]!['inverse']))).toBe('Original'); // set remembers the old value
    expect(JSON.parse(String(log[1]!['value']))).toBe('Renamed');
  });

  it('converges on the highest HLC whatever the apply order', () => {
    const titles: Record<string, string> = {
      [hlcAt(1_000_000, 0)]: 'first',
      [hlcAt(2_000_000, 0)]: 'second',
      [hlcAt(3_000_000, 0)]: 'third',
    };
    const hlcs = Object.keys(titles);
    const permutations = [
      [hlcs[0]!, hlcs[1]!, hlcs[2]!],
      [hlcs[2]!, hlcs[0]!, hlcs[1]!],
      [hlcs[1]!, hlcs[2]!, hlcs[0]!],
    ];

    for (const order of permutations) {
      const db = testDb();
      try {
        const id = newBookmark(db);
        for (const hlc of order) {
          applyOp(db.ctx, {
            collectionId: COLL, entity: 'bookmarks', entityId: id, field: 'title', op: 'set',
            value: titles[hlc]!, hlc,
          });
        }
        expect(row(db, 'bookmarks', id)['title']).toBe('third');
        const frontier = db.raw
          .prepare("SELECT hlc FROM op_frontier WHERE entity_id = ? AND field = 'title'")
          .get(id) as { hlc: string };
        expect(frontier.hlc).toBe(hlcs[2]);
        // every op is in history, applied or not
        expect(db.raw.prepare("SELECT count(*) AS n FROM ops WHERE entity_id = ? AND field = 'title'").get(id))
          .toEqual({ n: 3 });
      } finally {
        db.close();
      }
    }
  });

  it('records a stale op with applied = 0 and a duplicate as duplicate', () => {
    const id = newBookmark(t);
    const high = hlcAt(9_000_000);
    const low = hlcAt(1_000_000);
    applyOp(t.ctx, {
      collectionId: COLL, entity: 'bookmarks', entityId: id, field: 'title', op: 'set',
      value: 'winner', hlc: high,
    });

    const stale = applyOp(t.ctx, {
      collectionId: COLL, entity: 'bookmarks', entityId: id, field: 'title', op: 'set',
      value: 'loser', hlc: low,
    });
    expect(stale).toMatchObject({ applied: false, reason: 'stale' });
    expect(row(t, 'bookmarks', id)['title']).toBe('winner');

    const dup = applyOp(t.ctx, {
      collectionId: COLL, entity: 'bookmarks', entityId: id, field: 'title', op: 'set',
      value: 'winner', hlc: high,
    });
    expect(dup).toMatchObject({ applied: false, reason: 'duplicate' });

    const staleRow = t.raw
      .prepare('SELECT applied, value FROM ops WHERE hlc = ? AND entity_id = ?')
      .get(low, id) as { applied: number; value: string };
    expect(staleRow.applied).toBe(0);
    expect(JSON.parse(staleRow.value)).toBe('loser');
  });

  it('moves a tree node and inverts to the prior parent + frac_index', () => {
    const parentA = uuidv7(t.ctx.clock, t.ctx.random);
    const parentB = uuidv7(t.ctx.clock, t.ctx.random);
    const child = uuidv7(t.ctx.clock, t.ctx.random);
    for (const [id, parent, frac] of [
      [parentA, null, 'a0'],
      [parentB, null, 'a1'],
      [child, parentA, 'a0'],
    ] as [string, string | null, string][]) {
      applyOp(t.ctx, {
        collectionId: COLL, entity: 'tree_nodes', entityId: id, op: 'create',
        value: { parent_id: parent, frac_index: frac, kind: 'folder', label_fr: 'x' },
      });
    }

    const moved = applyOp(t.ctx, {
      collectionId: COLL, entity: 'tree_nodes', entityId: child, op: 'move',
      value: { parentId: parentB, fracIndex: 'a0V' },
    });
    expect(moved.applied).toBe(true);
    const after = row(t, 'tree_nodes', child);
    expect(after['parent_id']).toBe(parentB);
    expect(after['frac_index']).toBe('a0V');

    const log = ops(t, child);
    expect(JSON.parse(String(log.at(-1)!['inverse']))).toEqual({ parentId: parentA, fracIndex: 'a0' });
  });

  it('links and unlinks bookmark_tags with one frontier entry per tag', () => {
    const bm = newBookmark(t);
    const tagA = newTag(t, 'alpha');
    const tagB = newTag(t, 'beta');

    for (const tag of [tagA, tagB]) {
      const res = applyOp(t.ctx, {
        collectionId: COLL, entity: 'bookmark_tags', entityId: bm, op: 'link',
        value: { tag_id: tag, source: 'user' },
      });
      expect(res.applied).toBe(true);
    }
    expect(t.raw.prepare('SELECT count(*) AS n FROM bookmark_tags WHERE bookmark_id = ?').get(bm))
      .toEqual({ n: 2 });

    const fields = t.raw
      .prepare("SELECT field FROM op_frontier WHERE entity = 'bookmark_tags' AND entity_id = ? ORDER BY field")
      .all(bm) as { field: string }[];
    expect(fields.map((f) => f.field).sort()).toEqual([tagA, tagB].sort());

    t.clock.tick(10);
    const un = applyOp(t.ctx, {
      collectionId: COLL, entity: 'bookmark_tags', entityId: bm, field: tagA, op: 'unlink',
    });
    expect(un.applied).toBe(true);
    expect(t.raw.prepare('SELECT count(*) AS n FROM bookmark_tags WHERE bookmark_id = ?').get(bm))
      .toEqual({ n: 1 });
    const unlinkOp = t.raw
      .prepare("SELECT inverse FROM ops WHERE entity = 'bookmark_tags' AND op = 'unlink'")
      .get() as { inverse: string };
    expect(JSON.parse(unlinkOp.inverse)).toMatchObject({ bookmark_id: bm, tag_id: tagA, source: 'user' });
  });

  it('stamps run_id and origin on every op', () => {
    const runId = uuidv7(t.ctx.clock, t.ctx.random);
    t.raw
      .prepare(
        `INSERT INTO runs (id,collection_id,kind,started_at,expires_at) VALUES (?,?,'bulkEdit',?,?)`,
      )
      .run(runId, COLL, t.clock.iso(), t.clock.iso());
    const id = newBookmark(t);
    applyOp(t.ctx, {
      collectionId: COLL, entity: 'bookmarks', entityId: id, field: 'note', op: 'set',
      value: 'hello', runId,
    });
    const last = ops(t, id).at(-1)!;
    expect(last['run_id']).toBe(runId);
    expect(last['origin']).toBe('local');
  });

  it('honours a bundle origin', () => {
    const ctx: OpContext = { ...t.ctx, origin: 'bundle:deadbeef' };
    const id = uuidv7(ctx.clock, ctx.random);
    applyOp(ctx, {
      collectionId: COLL, entity: 'bookmarks', entityId: id, op: 'create',
      value: { url: 'https://a.example', url_norm: 'a.example', url_hash: 'b'.repeat(32) },
    });
    expect(ops(t, id)[0]!['origin']).toBe('bundle:deadbeef');
  });

  it('applyOps is atomic: a failing op in the middle rolls back the whole batch', () => {
    const id = newBookmark(t);
    const before = row(t, 'bookmarks', id)['title'];
    const opsBefore = (t.raw.prepare('SELECT count(*) AS n FROM ops').get() as { n: number }).n;

    expect(() =>
      applyOps(t.ctx, [
        { collectionId: COLL, entity: 'bookmarks', entityId: id, field: 'title', op: 'set', value: 'A' },
        // no such column → throws after the first op has already projected
        { collectionId: COLL, entity: 'bookmarks', entityId: id, field: 'nope', op: 'set', value: 'B' },
        { collectionId: COLL, entity: 'bookmarks', entityId: id, field: 'note', op: 'set', value: 'C' },
      ]),
    ).toThrow(/no column nope/);

    expect(row(t, 'bookmarks', id)['title']).toBe(before);
    expect(t.raw.prepare('SELECT count(*) AS n FROM ops').get()).toEqual({ n: opsBefore });
  });

  it('applyOps commits the whole batch when every op succeeds', () => {
    const id = newBookmark(t);
    const res = applyOps(t.ctx, [
      { collectionId: COLL, entity: 'bookmarks', entityId: id, field: 'title', op: 'set', value: 'A' },
      { collectionId: COLL, entity: 'bookmarks', entityId: id, field: 'note', op: 'set', value: 'C' },
    ]);
    expect(res.map((r) => r.applied)).toEqual([true, true]);
    expect(row(t, 'bookmarks', id)['title']).toBe('A');
    expect(row(t, 'bookmarks', id)['note']).toBe('C');
    expect(res[0]!.hlc < res[1]!.hlc).toBe(true);
  });

  it('rejects an unknown column and an invalid value', () => {
    const id = newBookmark(t);
    expect(() =>
      applyOp(t.ctx, {
        collectionId: COLL, entity: 'bookmarks', entityId: id, field: 'nope', op: 'set', value: 1,
      }),
    ).toThrow();
    expect(() =>
      applyOp(t.ctx, {
        collectionId: COLL, entity: 'bookmarks', entityId: id, field: 'status', op: 'set',
        value: 'not-a-status',
      }),
    ).toThrow();
  });
});
