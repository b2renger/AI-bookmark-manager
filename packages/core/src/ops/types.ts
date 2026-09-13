import type { Clock, DbHandle, Random } from '../ports/index.js';

// The single mutation layer's contract (plans/TECHNICAL-DESIGN.md §3.5–3.8). Feature code never
// issues UPDATE/INSERT/DELETE against a shareable table; it calls applyOp(). This file is the
// shared vocabulary; ops/applyOp.ts implements it, importers/exporters/bundle consume it.

export type OpKind = 'create' | 'set' | 'delete' | 'move' | 'link' | 'unlink';

/** Tables whose rows travel between peers and therefore go through the op log. */
export const SHAREABLE_ENTITIES = [
  'bookmarks', 'tags', 'tag_aliases', 'bookmark_tags', 'themes', 'theme_assignments',
  'tree_nodes', 'collections', 'members',
] as const;
export type ShareableEntity = (typeof SHAREABLE_ENTITIES)[number];

export interface OpInput {
  collectionId: string;
  entity: ShareableEntity;
  entityId: string;
  /** Omitted for create/delete/move/link/unlink. */
  field?: string;
  op: OpKind;
  /** JSON-serialisable. For create: the full row; for set: the field value; for move:
   *  { parentId, fracIndex }; for link/unlink: the join-row payload. */
  value?: unknown;
  runId?: string;
}

/** Hybrid logical clock generator: 29-char sortable strings `<ms b36×10>.<ctr b36×4>.<actor b58×8>`. */
export interface HlcGenerator {
  /** Mint the next HLC, strictly greater than any previously minted or received. */
  next(): string;
  /** Advance the clock past an HLC received from a peer or a bundle. */
  receive(remote: string): void;
  /** Last minted/received HLC (for tests and frontier bookkeeping). */
  last(): string | null;
}

export interface OpContext {
  db: DbHandle;
  clock: Clock;
  random: Random;
  /** base58 Ed25519 public key of this device; '' before an identity exists (P6). */
  actorPubkey: string;
  hlc: HlcGenerator;
  origin?: 'local' | `bundle:${string}` | `peer:${string}`;
}

export interface AppliedOp {
  id: string;
  hlc: string;
  applied: boolean;
  reason?: 'stale' | 'duplicate';
}

export interface FieldState {
  v: unknown;
  hlc: string;
}

/** One entity's LWW frontier as it travels in a bundle (`mode: 'state'`). */
export interface EntityState {
  entity: ShareableEntity;
  id: string;
  collectionId: string;
  fields: Record<string, FieldState>;
  deletedAt?: FieldState;
}
