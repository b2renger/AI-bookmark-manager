import { tableSchema } from '../db/schema.js';
import { uuidv7 } from '../ids/uuid.js';
import type { SqlValue } from '../ports/index.js';
import { projectorFor, type Projector } from './projectors.js';
import type { AppliedOp, OpContext, OpInput } from './types.js';

// THE single mutation layer (plans/TECHNICAL-DESIGN.md §3.7). No feature module issues an
// UPDATE/INSERT/DELETE against a shareable table; it calls applyOp(), which appends to `ops`,
// moves the LWW frontier and only then projects onto the row. Guarded by
// test/no-direct-update.test.ts.
//
// Frontier key = (entity, entity_id, field ?? ''). Three refinements over the bare §3.7 rule, each
// chosen so concurrent edits stay independent:
//   * `delete` defaults its field to 'deleted_at' on tombstonable tables, so a tombstone and a
//     concurrent title edit resolve on their own keys rather than fighting over ''.
//   * `link`/`unlink` default their field to the join row's second primary-key value, so linking
//     two tags to one bookmark is two frontier entries, not one.
//   * `create` keeps field '' — it is the whole-row op.

const OPS_INSERT_COLUMNS =
  'id,collection_id,entity,entity_id,field,op,value,inverse,hlc,actor_pubkey,origin,run_id,applied,created_at';
const OPS_INSERT_PLACEHOLDERS = '?,?,?,?,?,?,?,?,?,?,?,?,?,?';

function toSql(v: unknown): SqlValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Uint8Array) return v;
  return JSON.stringify(v);
}

function json(v: unknown): string | null {
  return v === undefined ? null : JSON.stringify(v ?? null);
}

function asRecord(v: unknown, what: string): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new Error(`applyOp: ${what} expects an object value`);
  }
  return { ...(v as Record<string, unknown>) };
}

/** The join-row identity carried in OpInput.field, plus the raw value for a typed WHERE. */
function linkIdentity(p: Projector, input: OpInput): { field: string; value: SqlValue } {
  if (!p.linkKey) throw new Error(`applyOp: ${p.table} is not a join table`);
  if (input.field !== undefined) return { field: input.field, value: input.field };
  const v = (input.value as Record<string, unknown> | undefined)?.[p.linkKey];
  if (v === undefined || v === null) {
    throw new Error(`applyOp: ${input.op} on ${p.table} needs field or value.${p.linkKey}`);
  }
  return { field: String(v), value: toSql(v) };
}

function readRow(
  ctx: OpContext,
  p: Projector,
  entityId: string,
  link: SqlValue | null,
): Record<string, unknown> | undefined {
  const where = p.linkKey ? `${p.idColumn} = ? AND ${p.linkKey} = ?` : `${p.idColumn} = ?`;
  const stmt = ctx.db.prepare(`SELECT * FROM ${p.table} WHERE ${where}`);
  const row = p.linkKey
    ? stmt.get<Record<string, unknown>>(entityId, link)
    : stmt.get<Record<string, unknown>>(entityId);
  return row;
}

function insertRow(ctx: OpContext, p: Projector, row: Record<string, unknown>, replace: boolean): void {
  const cols = Object.keys(row);
  const sql = `INSERT ${replace ? 'OR REPLACE ' : ''}INTO ${p.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
  ctx.db.prepare(sql).run(...cols.map((c) => toSql(row[c])));
}

interface Prepared {
  field: string | null;
  link: SqlValue | null;
  inverse: unknown;
  project: () => void;
}

/** Steps 4 and 7 together: capture the undo material, then hand back the projection to run once the
 *  op row and the frontier are in place. */
function prepare(ctx: OpContext, input: OpInput, p: Projector, iso: string): Prepared {
  const { entity, entityId, op } = input;
  if (!p.ops.includes(op)) throw new Error(`applyOp: ${op} is not valid on ${entity}`);
  const schema = tableSchema(p.table);
  const shape = schema.shape;

  switch (op) {
    case 'create': {
      const raw = asRecord(input.value, 'create');
      if (raw[p.idColumn] === undefined) raw[p.idColumn] = entityId;
      if ('collection_id' in shape && raw['collection_id'] === undefined) {
        raw['collection_id'] = input.collectionId;
      }
      if (p.hasCreatedAt && raw['created_at'] === undefined) raw['created_at'] = iso;
      if (p.hasUpdatedAt && raw['updated_at'] === undefined) raw['updated_at'] = iso;
      const prior = readRow(ctx, p, entityId, null);
      const row = schema.parse(raw);
      return {
        field: input.field ?? null,
        link: null,
        inverse: prior ?? null,
        project: () => insertRow(ctx, p, row, false),
      };
    }

    case 'set': {
      const field = input.field;
      if (!field) throw new Error('applyOp: set needs a field');
      if (!(field in shape)) throw new Error(`applyOp: ${p.table} has no column ${field}`);
      if (p.linkKey) throw new Error(`applyOp: use link/unlink on the join table ${p.table}`);
      const parsed = schema.partial().parse({ [field]: input.value }) as Record<string, unknown>;
      const value = parsed[field];
      const prior = readRow(ctx, p, entityId, null);
      if (!prior) throw new Error(`applyOp: ${p.table} ${entityId} does not exist`);
      return {
        field,
        link: null,
        inverse: prior[field] ?? null,
        project: () => {
          ctx.db
            .prepare(`UPDATE ${p.table} SET ${field} = ? WHERE ${p.idColumn} = ?`)
            .run(toSql(value), entityId);
        },
      };
    }

    case 'delete': {
      if (p.hasDeletedAt) {
        const at = typeof input.value === 'string' ? input.value : iso;
        const prior = readRow(ctx, p, entityId, null);
        return {
          field: input.field ?? 'deleted_at',
          link: null,
          inverse: prior ? (prior['deleted_at'] ?? null) : null,
          project: () => {
            ctx.db
              .prepare(`UPDATE ${p.table} SET deleted_at = ? WHERE ${p.idColumn} = ?`)
              .run(at, entityId);
          },
        };
      }
      const id = linkIdentity(p, input);
      const prior = readRow(ctx, p, entityId, id.value);
      return {
        field: id.field,
        link: id.value,
        inverse: prior ?? null,
        project: () => {
          ctx.db
            .prepare(`DELETE FROM ${p.table} WHERE ${p.idColumn} = ? AND ${p.linkKey!} = ?`)
            .run(entityId, id.value);
        },
      };
    }

    case 'move': {
      const v = asRecord(input.value, 'move');
      const parentId = (v['parentId'] ?? v['parent_id'] ?? null) as string | null;
      const fracIndex = (v['fracIndex'] ?? v['frac_index']) as string | undefined;
      if (typeof fracIndex !== 'string') throw new Error('applyOp: move needs a fracIndex');
      const prior = readRow(ctx, p, entityId, null);
      if (!prior) throw new Error(`applyOp: ${p.table} ${entityId} does not exist`);
      return {
        field: input.field ?? null,
        link: null,
        inverse: { parentId: prior['parent_id'] ?? null, fracIndex: prior['frac_index'] },
        project: () => {
          ctx.db
            .prepare(`UPDATE ${p.table} SET parent_id = ?, frac_index = ? WHERE id = ?`)
            .run(parentId, fracIndex, entityId);
        },
      };
    }

    case 'link': {
      const id = linkIdentity(p, input);
      const raw = asRecord(input.value, 'link');
      raw[p.idColumn] = entityId;
      if (raw[p.linkKey!] === undefined) raw[p.linkKey!] = id.field;
      if (p.hasCreatedAt && raw['created_at'] === undefined) raw['created_at'] = iso;
      const row = schema.parse(raw);
      const prior = readRow(ctx, p, entityId, id.value);
      return {
        field: id.field,
        link: id.value,
        inverse: prior ?? null,
        project: () => insertRow(ctx, p, row, true),
      };
    }

    case 'unlink': {
      const id = linkIdentity(p, input);
      const prior = readRow(ctx, p, entityId, id.value);
      return {
        field: id.field,
        link: id.value,
        inverse: prior ?? null,
        project: () => {
          ctx.db
            .prepare(`DELETE FROM ${p.table} WHERE ${p.idColumn} = ? AND ${p.linkKey!} = ?`)
            .run(entityId, id.value);
        },
      };
    }
  }
}

function applyOne(ctx: OpContext, input: OpInput): AppliedOp {
  const p = projectorFor(input.entity);
  const iso = ctx.clock.iso();
  const id = uuidv7(ctx.clock, ctx.random);

  // 1. mint (or adopt) the HLC
  let hlc: string;
  if (input.hlc !== undefined) {
    ctx.hlc.receive(input.hlc);
    hlc = input.hlc;
  } else {
    hlc = ctx.hlc.next();
  }

  const writeOp = (field: string | null, value: unknown, inverse: unknown, applied: 0 | 1): void => {
    ctx.db
      .prepare(
        `INSERT ${applied ? '' : 'OR IGNORE '}INTO ops (${OPS_INSERT_COLUMNS}) VALUES (${OPS_INSERT_PLACEHOLDERS})`,
      )
      .run(
        id,
        input.collectionId,
        input.entity,
        input.entityId,
        field,
        input.op,
        json(value),
        json(inverse),
        hlc,
        ctx.actorPubkey,
        ctx.origin ?? 'local',
        input.runId ?? null,
        applied,
        iso,
      );
  };

  // 2–3. the frontier compare. A stale or duplicate op is still recorded: history is kept, only the
  // projection is skipped.
  const frontierField =
    input.op === 'delete' && p.hasDeletedAt
      ? (input.field ?? 'deleted_at')
      : input.op === 'link' || input.op === 'unlink' || (input.op === 'delete' && !p.hasDeletedAt)
        ? linkIdentity(p, input).field
        : (input.field ?? '');

  const existing = ctx.db
    .prepare('SELECT hlc FROM op_frontier WHERE entity = ? AND entity_id = ? AND field = ?')
    .get<{ hlc: string }>(input.entity, input.entityId, frontierField);

  if (existing && existing.hlc >= hlc) {
    writeOp(frontierField === '' ? null : frontierField, input.value, null, 0);
    return { id, hlc, applied: false, reason: existing.hlc === hlc ? 'duplicate' : 'stale' };
  }

  // 4. capture the inverse and build the projection
  const prepared = prepare(ctx, input, p, iso);

  // 5–6. append, then move the frontier
  writeOp(prepared.field, input.value, prepared.inverse, 1);
  ctx.db
    .prepare(
      `INSERT INTO op_frontier (entity, entity_id, field, hlc, op_id) VALUES (?,?,?,?,?)
       ON CONFLICT(entity, entity_id, field) DO UPDATE SET hlc = excluded.hlc, op_id = excluded.op_id`,
    )
    .run(input.entity, input.entityId, frontierField, hlc, id);

  // 7. project
  prepared.project();

  // 8. touch updated_at (create already stamped it; a set on updated_at is its own truth)
  if (p.hasUpdatedAt && input.op !== 'create' && prepared.field !== 'updated_at') {
    ctx.db
      .prepare(`UPDATE ${p.table} SET updated_at = ? WHERE ${p.idColumn} = ?`)
      .run(iso, input.entityId);
  }

  return { id, hlc, applied: true };
}

export function applyOp(ctx: OpContext, input: OpInput): AppliedOp {
  return ctx.db.transaction(() => applyOne(ctx, input))();
}

/** One transaction: a throw anywhere rolls the whole batch back. */
export function applyOps(ctx: OpContext, inputs: OpInput[]): AppliedOp[] {
  return ctx.db.transaction(() => inputs.map((i) => applyOne(ctx, i)))();
}

export { MUTATION_TABLES } from './projectors.js';
