import { tableColumns, type TableName } from '../db/schema.js';
import { SHAREABLE_ENTITIES, type OpKind, type ShareableEntity } from './types.js';

// Step 7 of §3.7: "the actual UPDATE bookmarks SET title = ? etc., dispatched by a per-entity
// projector table". Everything a projection needs is structural — which column OpInput.entityId
// addresses, whether the row can be tombstoned, whether it is a join row — so the table is data and
// applyOp.ts is one generic implementation rather than nine hand-written ones.

export interface Projector {
  table: TableName;
  /** The column OpInput.entityId addresses. */
  idColumn: string;
  /** Join tables only: the second primary-key column. It travels in OpInput.field, so two links
   *  from the same owner get independent frontier entries instead of clobbering each other. */
  linkKey: string | null;
  hasCreatedAt: boolean;
  hasUpdatedAt: boolean;
  /** Tombstoned with `deleted_at`; false means `delete` really removes the row (join tables). */
  hasDeletedAt: boolean;
  ops: readonly OpKind[];
}

const ROW_OPS = ['create', 'set', 'delete'] as const;
const JOIN_OPS = ['link', 'unlink'] as const;

function row(table: TableName, extra: readonly OpKind[] = []): Projector {
  const cols = tableColumns(table);
  return {
    table,
    idColumn: 'id',
    linkKey: null,
    hasCreatedAt: cols.includes('created_at'),
    hasUpdatedAt: cols.includes('updated_at'),
    hasDeletedAt: cols.includes('deleted_at'),
    ops: [...ROW_OPS, ...extra],
  };
}

function join(table: TableName, idColumn: string, linkKey: string): Projector {
  const cols = tableColumns(table);
  return {
    table,
    idColumn,
    linkKey,
    hasCreatedAt: cols.includes('created_at'),
    hasUpdatedAt: cols.includes('updated_at'),
    hasDeletedAt: false,
    ops: [...JOIN_OPS, 'delete'],
  };
}

export const PROJECTORS: Record<ShareableEntity, Projector> = {
  bookmarks: row('bookmarks'),
  tags: row('tags'),
  tag_aliases: row('tag_aliases'),
  bookmark_tags: join('bookmark_tags', 'bookmark_id', 'tag_id'),
  themes: row('themes'),
  theme_assignments: join('theme_assignments', 'bookmark_id', 'resolution'),
  tree_nodes: row('tree_nodes', ['move']),
  collections: row('collections'),
  members: row('members'),
};

/** The tables only ops/ and db/migrations/ may write. Enforced by test/no-direct-update.test.ts. */
export const MUTATION_TABLES = SHAREABLE_ENTITIES;

export function projectorFor(entity: ShareableEntity): Projector {
  const p = PROJECTORS[entity];
  if (!p) throw new Error(`applyOp: ${entity} is not a shareable entity`);
  return p;
}
