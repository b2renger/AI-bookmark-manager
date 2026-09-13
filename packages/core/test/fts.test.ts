import { beforeEach, describe, expect, it } from 'vitest';
import { _resetUuidState, uuidv7 } from '../src/ids/uuid.js';
import { applyOp } from '../src/ops/applyOp.js';
import {
  buildFtsQuery, foldDiacritics, ftsRebuild, ftsSearchBookmarks, ftsSetTriggers,
} from '../src/search/fts.js';
import { stem } from '../src/search/stems.js';
import { LIBRARY_COLLECTION_ID } from '../src/db/migrations/0001_init.js';
import { testDb, type TestDb } from './helpers/db.js';

const COLL = LIBRARY_COLLECTION_ID;

let seq = 0;
function add(t: TestDb, title: string, extra: Record<string, unknown> = {}): string {
  const id = uuidv7(t.ctx.clock, t.ctx.random);
  seq += 1;
  applyOp(t.ctx, {
    collectionId: COLL, entity: 'bookmarks', entityId: id, op: 'create',
    value: {
      url: `https://example.com/${seq}`,
      url_norm: `example.com/${seq}`,
      url_hash: String(seq).padStart(32, '0'),
      title,
      ...extra,
    },
  });
  return id;
}

function search(t: TestDb, q: string): string[] {
  return ftsSearchBookmarks(t.db, buildFtsQuery(q)).map((h) => h.id);
}

describe('buildFtsQuery', () => {
  it('folds diacritics, quotes tokens, ANDs them and prefixes the last', () => {
    expect(buildFtsQuery('Café Résumé')).toBe('"cafe" AND "resume"*');
    expect(buildFtsQuery('  ')).toBe('');
    expect(buildFtsQuery('a-b_c')).toBe('"a" AND "b" AND "c"*');
    expect(foldDiacritics('Élève')).toBe('eleve');
  });

  it('applies the stem map, and lang:null turns stemming off', () => {
    expect(stem('applications')).toBe('application');
    expect(buildFtsQuery('applications')).toBe('"application"*');
    expect(buildFtsQuery('applications', { lang: null })).toBe('"applications"*');
    expect(stem('chevaux')).toBe('cheval');
    expect(stem('cafe')).toBe('cafe'); // short tokens are left alone
  });

  it('never injects an unquoted FTS operator', () => {
    expect(buildFtsQuery('foo OR bar" NEAR')).toBe('"foo" AND "or" AND "bar" AND "near"*');
  });
});

describe('fts over bookmarks', () => {
  let t: TestDb;
  beforeEach(() => {
    _resetUuidState();
    seq = 0;
    t = testDb();
    return () => t.close();
  });

  it('matches café/cafe and Résumé/resume in both directions', () => {
    const cafe = add(t, 'café');
    const resume = add(t, 'Résumé');

    expect(search(t, 'cafe')).toEqual([cafe]);
    expect(search(t, 'café')).toEqual([cafe]);
    expect(search(t, 'resume')).toEqual([resume]);
    expect(search(t, 'Résumé')).toEqual([resume]);
  });

  it('prefix-matches the last token', () => {
    const cafe = add(t, 'café');
    expect(search(t, 'caf')).toEqual([cafe]);
    expect(search(t, 'zzz')).toEqual([]);
  });

  it('hits through the stem map', () => {
    const id = add(t, 'Une application de gestion', { note: 'cheval' });
    expect(search(t, 'applications')).toEqual([id]);
    expect(search(t, 'chevaux')).toEqual([id]);
  });

  it('searches summary, note, author and the url text', () => {
    const id = add(t, 'zzz', { summary: 'un résumé', note: 'ma note', author: 'Zoé' });
    expect(search(t, 'resume')).toEqual([id]);
    expect(search(t, 'note')).toEqual([id]);
    expect(search(t, 'zoe')).toEqual([id]);
    expect(ftsSearchBookmarks(t.db, buildFtsQuery('example.com')).map((h) => h.id)).toContain(id);
  });

  it('drops tombstoned rows and honours limit/offset', () => {
    const a = add(t, 'chat noir');
    const b = add(t, 'chat blanc');
    expect(search(t, 'chat').sort()).toEqual([a, b].sort());
    expect(ftsSearchBookmarks(t.db, buildFtsQuery('chat'), { limit: 1 })).toHaveLength(1);
    expect(ftsSearchBookmarks(t.db, buildFtsQuery('chat'), { limit: 1, offset: 1 })).toHaveLength(1);

    applyOp(t.ctx, { collectionId: COLL, entity: 'bookmarks', entityId: a, op: 'delete' });
    expect(search(t, 'chat')).toEqual([b]);
  });

  it('stays consistent through an update', () => {
    const id = add(t, 'avant');
    applyOp(t.ctx, {
      collectionId: COLL, entity: 'bookmarks', entityId: id, field: 'title', op: 'set',
      value: 'après',
    });
    expect(search(t, 'avant')).toEqual([]);
    expect(search(t, 'apres')).toEqual([id]);
  });

  it('ftsSetTriggers(false) + ftsRebuild() is the bulk-import path', () => {
    ftsSetTriggers(t.db, false);
    const id = add(t, 'importé en masse');
    expect(search(t, 'importe')).toEqual([]); // no trigger fired

    ftsSetTriggers(t.db, true);
    ftsRebuild(t.db);
    expect(search(t, 'importe')).toEqual([id]);

    // the recreated triggers work exactly like the migrated ones
    const later = add(t, 'après rebuild');
    expect(search(t, 'rebuild')).toEqual([later]);
  });
});
