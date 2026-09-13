import { z } from 'zod';

// The Zod mirror of 0001_init.ts (plans/TECHNICAL-DESIGN.md §3.4). Hand-written, one object per
// table, kept honest by test/schema.test.ts which reads `PRAGMA table_info` from a freshly migrated
// database and asserts the column sets match.
//
// Convention: a column with a DDL DEFAULT gets the same `.default(...)` here, and a nullable column
// with no DDL default gets `.nullable().default(null)`. So `Row.parse(partialObject)` yields exactly
// the row SQLite would produce — which is what makes `applyOp`'s `create` path a plain INSERT of
// every column.

/** UUIDv7, 36 lowercase chars: version nibble 7, variant nibble 8..b. */
export const Uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

/** ISO-8601 UTC, no offset form, e.g. 2026-01-01T00:00:00.000Z */
export const Iso = z.iso.datetime({ offset: false });

/** 29-char hybrid logical clock, see ops/hlc.ts. */
export const Hlc = z.string().regex(/^[0-9a-z]{10}\.[0-9a-z]{4}\.[1-9A-HJ-NP-Za-km-z]{8}$/);

const Blob = z.instanceof(Uint8Array);
const Int = z.number().int();
/** SQLite has no boolean: 0 or 1 in an INTEGER column. */
const Bool01 = z.union([z.literal(0), z.literal(1)]);

// ─────────────────────────────────────────────────────────────────────── shareable tables

export const CollectionRow = z.object({
  id: Uuid,
  name: z.string(),
  description: z.string().default(''),
  visibility: z.enum(['private', 'shared', 'published']).default('private'),
  epoch: Int.default(1),
  key_ref: z.string().nullable().default(null),
  snapshots_enabled: Bool01.default(0),
  owner_pubkey: z.string(),
  created_at: Iso,
  updated_at: Iso,
  deleted_at: Iso.nullable().default(null),
});
export type CollectionRow = z.infer<typeof CollectionRow>;

export const BookmarkRow = z.object({
  id: Uuid,
  collection_id: Uuid,
  url: z.url(),
  url_norm: z.string(),
  url_hash: z.string().length(32),
  title: z.string().default(''),
  summary: z.string().default(''),
  summary_kind: z.enum(['none', 'extractive', 'llm', 'imported']).default('none'),
  summary_model_id: z.string().nullable().default(null),
  author: z.string().nullable().default(null),
  platform: z
    .enum(['youtube', 'threads', 'twitter', 'github', 'article', 'website', 'pdf'])
    .nullable()
    .default(null),
  lang: z.string().length(2).nullable().default(null),
  thumbnail_url: z.string().nullable().default(null),
  note: z.string().default(''),
  status: z.enum(['new', 'fetching', 'ready', 'partial', 'failed']).default('new'),
  starred: Bool01.default(0),
  open_count: Int.default(0),
  last_opened_at: Iso.nullable().default(null),
  confidence: Int.min(0).max(100).nullable().default(null),
  confidence_reason: z.string().nullable().default(null),
  acquisition_method: z.string().nullable().default(null),
  current_version_id: Uuid.nullable().default(null),
  map_x: z.number().nullable().default(null),
  map_y: z.number().nullable().default(null),
  map_run_id: Uuid.nullable().default(null),
  created_at: Iso,
  updated_at: Iso,
  deleted_at: Iso.nullable().default(null),
});
export type BookmarkRow = z.infer<typeof BookmarkRow>;

export const TagRow = z.object({
  id: Uuid,
  collection_id: Uuid,
  label: z.string(),
  label_norm: z.string(),
  label_fr: z.string().nullable().default(null),
  label_en: z.string().nullable().default(null),
  color: z.string().nullable().default(null),
  usage_count: Int.default(0),
  created_at: Iso,
  updated_at: Iso,
  deleted_at: Iso.nullable().default(null),
});
export type TagRow = z.infer<typeof TagRow>;

export const TagAliasRow = z.object({
  id: Uuid,
  tag_id: Uuid,
  alias: z.string(),
  alias_norm: z.string(),
  source: z.enum(['user', 'import', 'ai']),
  run_id: Uuid.nullable().default(null),
  created_at: Iso,
});
export type TagAliasRow = z.infer<typeof TagAliasRow>;

export const BookmarkTagRow = z.object({
  bookmark_id: Uuid,
  tag_id: Uuid,
  source: z.enum(['user', 'import', 'ai']),
  accepted: Bool01.default(1),
  score: z.number().nullable().default(null),
  run_id: Uuid.nullable().default(null),
  created_at: Iso,
});
export type BookmarkTagRow = z.infer<typeof BookmarkTagRow>;

export const ThemeRow = z.object({
  id: Uuid,
  collection_id: Uuid,
  run_id: Uuid,
  resolution: z.number(),
  parent_id: Uuid.nullable().default(null),
  label_fr: z.string(),
  label_en: z.string(),
  description_fr: z.string().default(''),
  description_en: z.string().default(''),
  emoji: z.string().nullable().default(null),
  terms: z.string().default('[]'),
  centroid: Blob.nullable().default(null),
  size: Int.default(0),
  color_idx: Int.nullable().default(null),
  label_source: z.enum(['llm', 'ctfidf', 'user']).default('llm'),
  created_at: Iso,
  updated_at: Iso,
  deleted_at: Iso.nullable().default(null),
});
export type ThemeRow = z.infer<typeof ThemeRow>;

export const ThemeAssignmentRow = z.object({
  bookmark_id: Uuid,
  theme_id: Uuid,
  resolution: z.number(),
  score: z.number(),
  margin: z.number(),
  source: z.enum(['centroid', 'llm', 'user']),
  run_id: Uuid,
});
export type ThemeAssignmentRow = z.infer<typeof ThemeAssignmentRow>;

export const TreeNodeRow = z.object({
  id: Uuid,
  collection_id: Uuid,
  parent_id: Uuid.nullable().default(null),
  frac_index: z.string(),
  kind: z.enum(['theme', 'query', 'pin', 'folder', 'bookmark']),
  ref_id: Uuid.nullable().default(null),
  label_fr: z.string().default(''),
  label_en: z.string().default(''),
  emoji: z.string().nullable().default(null),
  query: z.string().nullable().default(null),
  pinned: Bool01.default(0),
  user_edited: Bool01.default(0),
  depth: Int.min(0).max(4).default(0),
  run_id: Uuid.nullable().default(null),
  created_at: Iso,
  updated_at: Iso,
  deleted_at: Iso.nullable().default(null),
});
export type TreeNodeRow = z.infer<typeof TreeNodeRow>;

export const MemberRow = z.object({
  id: Uuid,
  collection_id: Uuid,
  pubkey: z.string(),
  x25519_pub: z.string(),
  name: z.string().default(''),
  role: z.enum(['owner', 'writer', 'reader']),
  epoch_granted: Int,
  added_at: Iso,
  removed_at: Iso.nullable().default(null),
});
export type MemberRow = z.infer<typeof MemberRow>;

// ───────────────────────────────────────────────────── derived / machine-local tables

export const ContentVersionRow = z.object({
  id: Uuid,
  bookmark_id: Uuid,
  fetched_at: Iso,
  method: z.string(),
  tier: Int,
  http_status: Int.nullable().default(null),
  final_url: z.string().nullable().default(null),
  lang: z.string().nullable().default(null),
  title: z.string().nullable().default(null),
  text: z.string().nullable().default(null),
  text_hash: z.string().nullable().default(null),
  html_hash: z.string().nullable().default(null),
  snapshot_hash: z.string().nullable().default(null),
  byte_len: Int.nullable().default(null),
  confidence: Int,
  confidence_reason: z.string(),
  extractor_version: z.string(),
  error: z.string().nullable().default(null),
});
export type ContentVersionRow = z.infer<typeof ContentVersionRow>;

export const ChunkRow = z.object({
  id: Uuid,
  bookmark_id: Uuid,
  version_id: Uuid,
  ord: Int,
  heading_path: z.string().default(''),
  char_start: Int,
  char_end: Int,
  token_est: Int,
  page: Int.nullable().default(null),
  text: z.string(),
});
export type ChunkRow = z.infer<typeof ChunkRow>;

export const EmbeddingRow = z.object({
  owner_type: z.enum(['bookmark', 'chunk', 'tag', 'theme', 'query']),
  owner_id: Uuid,
  model_id: z.string(),
  dim: Int,
  vec: Blob,
  created_at: Iso,
});
export type EmbeddingRow = z.infer<typeof EmbeddingRow>;

export const FeedbackEventRow = z.object({
  id: Uuid,
  at: Iso,
  query_id: Uuid.nullable().default(null),
  query_text: z.string().nullable().default(null),
  bookmark_id: Uuid.nullable().default(null),
  event: z.enum(['shown', 'click', 'dwell', 'dismiss', 'open', 'accept', 'reject']),
  rank: Int.nullable().default(null),
  dwell_ms: Int.nullable().default(null),
  context: z.string().nullable().default(null),
});
export type FeedbackEventRow = z.infer<typeof FeedbackEventRow>;

export const SearchAffinityRow = z.object({
  kind: z.enum(['tag', 'domain', 'theme']),
  key: z.string(),
  weight: z.number(),
  updated_at: Iso,
});
export type SearchAffinityRow = z.infer<typeof SearchAffinityRow>;

export const JobRow = z.object({
  id: Uuid,
  kind: z.string(),
  payload: z.string(),
  priority: Int.default(2),
  status: z
    .enum(['pending', 'running', 'done', 'failed', 'cancelled', 'blocked'])
    .default('pending'),
  attempts: Int.default(0),
  max_attempts: Int.default(3),
  not_before: Iso.nullable().default(null),
  lease_until: Iso.nullable().default(null),
  run_id: Uuid.nullable().default(null),
  dedupe_key: z.string().nullable().default(null),
  last_error: z.string().nullable().default(null),
  created_at: Iso,
  started_at: Iso.nullable().default(null),
  finished_at: Iso.nullable().default(null),
});
export type JobRow = z.infer<typeof JobRow>;

export const RunRow = z.object({
  id: Uuid,
  collection_id: Uuid,
  kind: z.string(),
  status: z
    .enum([
      'planned', 'running', 'proposed', 'partial', 'accepted',
      'rejected', 'reverted', 'expired', 'failed',
    ])
    .default('planned'),
  params: z.string().default('{}'),
  stats: z.string().default('{}'),
  provider: z.string().nullable().default(null),
  model_id: z.string().nullable().default(null),
  cost_eur: z.number().nullable().default(null),
  reverts_run_id: Uuid.nullable().default(null),
  started_at: Iso,
  finished_at: Iso.nullable().default(null),
  expires_at: Iso,
});
export type RunRow = z.infer<typeof RunRow>;

export const OpKindEnum = z.enum(['create', 'set', 'delete', 'move', 'link', 'unlink']);

export const RunItemRow = z.object({
  id: Uuid,
  run_id: Uuid,
  group_key: z.string().nullable().default(null),
  entity: z.string(),
  entity_id: Uuid,
  field: z.string().nullable().default(null),
  op: OpKindEnum,
  before: z.string().nullable().default(null),
  after: z.string().nullable().default(null),
  confidence: z.number().nullable().default(null),
  reason_fr: z.string().nullable().default(null),
  reason_en: z.string().nullable().default(null),
  decision: z.enum(['pending', 'accept', 'reject']).default('pending'),
  decided_at: Iso.nullable().default(null),
  op_id: Uuid.nullable().default(null),
});
export type RunItemRow = z.infer<typeof RunItemRow>;

export const OpRow = z.object({
  id: Uuid,
  collection_id: Uuid,
  entity: z.string(),
  entity_id: Uuid,
  field: z.string().nullable().default(null),
  op: OpKindEnum,
  value: z.string().nullable().default(null),
  inverse: z.string().nullable().default(null),
  hlc: Hlc,
  actor_pubkey: z.string(),
  origin: z.string().default('local'),
  run_id: Uuid.nullable().default(null),
  applied: Bool01.default(1),
  created_at: Iso,
});
export type OpRow = z.infer<typeof OpRow>;

export const OpFrontierRow = z.object({
  entity: z.string(),
  entity_id: Uuid,
  field: z.string(),
  hlc: Hlc,
  op_id: Uuid,
});
export type OpFrontierRow = z.infer<typeof OpFrontierRow>;

export const EgressLogRow = z.object({
  id: Uuid,
  at: Iso,
  host: z.string(),
  purpose: z.string(),
  method: z.string().nullable().default(null),
  item_count: Int.default(1),
  bytes_out: Int.default(0),
  bytes_in: Int.default(0),
  collection_id: Uuid.nullable().default(null),
  run_id: Uuid.nullable().default(null),
  scope: z.string(),
  status: z.enum(['pending', 'ok', 'error', 'blocked']),
  duration_ms: Int.nullable().default(null),
  error: z.string().nullable().default(null),
});
export type EgressLogRow = z.infer<typeof EgressLogRow>;

export const SettingRow = z.object({
  key: z.string(),
  value: z.string(),
  updated_at: Iso,
});
export type SettingRow = z.infer<typeof SettingRow>;

export const SnapshotRow = z.object({
  hash: z.string(),
  path: z.string(),
  bytes: Int,
  created_at: Iso,
  last_used: Iso,
  ref_count: Int.default(1),
});
export type SnapshotRow = z.infer<typeof SnapshotRow>;

export const KnnEdgeRow = z.object({
  src_id: Uuid,
  k_rank: Int,
  dst_id: Uuid,
  sim: z.number(),
  model_id: z.string(),
  built_at: Iso,
});
export type KnnEdgeRow = z.infer<typeof KnnEdgeRow>;

/** Every real table in 0001_init.ts. The FTS5 and vec0 virtual tables are indexes, not rows, and
 *  are deliberately absent. */
export const Tables = {
  collections: CollectionRow,
  bookmarks: BookmarkRow,
  content_versions: ContentVersionRow,
  chunks: ChunkRow,
  embeddings: EmbeddingRow,
  tags: TagRow,
  tag_aliases: TagAliasRow,
  bookmark_tags: BookmarkTagRow,
  themes: ThemeRow,
  theme_assignments: ThemeAssignmentRow,
  tree_nodes: TreeNodeRow,
  members: MemberRow,
  feedback_events: FeedbackEventRow,
  search_affinity: SearchAffinityRow,
  jobs: JobRow,
  runs: RunRow,
  run_items: RunItemRow,
  ops: OpRow,
  op_frontier: OpFrontierRow,
  egress_log: EgressLogRow,
  settings: SettingRow,
  snapshots: SnapshotRow,
  knn_edges: KnnEdgeRow,
};

export type TableName = keyof typeof Tables;
export const TABLE_NAMES = Object.keys(Tables) as TableName[];

/** Loose accessor for generic code (applyOp, the exporter): shape + parse without the row type. */
export function tableSchema(name: TableName): z.ZodObject<z.ZodRawShape> {
  return Tables[name] as unknown as z.ZodObject<z.ZodRawShape>;
}

/** Column names, in declaration order. */
export function tableColumns(name: TableName): string[] {
  return Object.keys(tableSchema(name).shape);
}
