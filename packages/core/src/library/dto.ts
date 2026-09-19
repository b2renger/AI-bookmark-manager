// The shapes the renderer sees. apps/desktop/src/shared/protocol.ts declares the same types a
// second time (it cannot import core: the preload bundle must stay dependency-free), so these two
// files are kept structurally identical. The assertion is a type-level one in
// apps/desktop/src/main/ipc/library.ts — if they drift, `npm run typecheck` fails — plus the
// runtime vocabulary test in packages/core/test/library/dto.test.ts.

/** Every vocabulary below mirrors a CHECK constraint in db/migrations/0001_init.ts. */
export const PLATFORMS = [
  'youtube', 'threads', 'twitter', 'github', 'article', 'website', 'pdf',
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const BOOKMARK_STATUSES = ['new', 'fetching', 'ready', 'partial', 'failed'] as const;
export type BookmarkStatus = (typeof BOOKMARK_STATUSES)[number];

export const SUMMARY_KINDS = ['none', 'extractive', 'llm', 'imported'] as const;
export type SummaryKind = (typeof SUMMARY_KINDS)[number];

export const TAG_SOURCES = ['user', 'import', 'ai'] as const;
export type TagSource = (typeof TAG_SOURCES)[number];

/** Free-form per the DDL (`acquisition_method TEXT`), e.g. `http:defuddle`. Null until P3. */
export type AcquisitionMethod = string | null;

export interface TagRefDto {
  id: string;
  label: string;
  source: TagSource;
  accepted: boolean;
}

/** One row of the virtualised table. Nullable rather than optional: these come straight from SQL. */
export interface BookmarkRowDto {
  id: string;
  collectionId: string;
  url: string;
  urlNorm: string;
  title: string | null;
  summary: string | null;
  summaryKind: SummaryKind;
  platform: Platform | null;
  lang: string | null;
  status: BookmarkStatus;
  starred: boolean;
  confidence: number | null;
  confidenceReason: string | null;
  acquisitionMethod: AcquisitionMethod;
  thumbnailUrl: string | null;
  author: string | null;
  createdAt: string;
  updatedAt: string;
  tags: TagRefDto[];
  openCount: number;
}

export interface ContentVersionDto {
  method: AcquisitionMethod;
  tier: number;
  fetchedAt: string;
  textLen: number;
  confidence: number | null;
  confidenceReason: string | null;
}

export interface BookmarkDetailDto extends BookmarkRowDto {
  note: string | null;
  currentVersion?: ContentVersionDto;
  chunkCount: number;
}

export const LIBRARY_SORTS = [
  'created_desc', 'created_asc', 'title', 'confidence_desc', 'updated_desc',
] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

export interface LibraryQueryInput {
  collectionId?: string;
  text?: string;
  tagIds?: string[];
  platform?: Platform;
  status?: BookmarkStatus;
  dateFrom?: string;
  dateTo?: string;
  sort: LibrarySort;
  cursor?: string;
  limit: number;
}

export interface FacetBucket {
  key: string;
  count: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
  facets?: {
    platform: FacetBucket[];
    status: FacetBucket[];
  };
}

// ── saveUrls ──────────────────────────────────────────────────────────────────────────────

export type SaveSource = 'paste' | 'import' | 'extension';

export interface SaveUrlItem {
  url: string;
  addDate?: string;
  title?: string;
}

export interface SaveUrlsRequest {
  collectionId?: string;
  items: SaveUrlItem[];
  source: SaveSource;
}

export interface SavedRefDto {
  id: string;
  url: string;
  urlNorm: string;
}

export interface SaveUrlsResponse {
  accepted: SavedRefDto[];
  duplicates: { url: string; existingId: string }[];
  rejected: { url: string; reason: string }[];
}

// ── applyOps ──────────────────────────────────────────────────────────────────────────────

export type OpKindDto = 'create' | 'set' | 'delete' | 'move' | 'link' | 'unlink';

export type ShareableEntityDto =
  | 'bookmarks' | 'tags' | 'tag_aliases' | 'bookmark_tags' | 'themes' | 'theme_assignments'
  | 'tree_nodes' | 'collections' | 'members';

export interface OpInputDto {
  collectionId: string;
  entity: ShareableEntityDto;
  entityId: string;
  field?: string;
  op: OpKindDto;
  value?: unknown;
  runId?: string;
}

export interface ApplyOpsRequest {
  ops: OpInputDto[];
}

export interface ApplyOpsResponse {
  opIds: string[];
  hlc: string;
}

// ── bulkEdit ──────────────────────────────────────────────────────────────────────────────

export interface BulkEditRequest {
  ids: string[];
  addTags?: string[];
  removeTags?: string[];
  setCollection?: string;
  setStarred?: boolean;
  softDelete?: boolean;
}

export interface BulkEditResponse {
  runId: string;
  changed: number;
}

// ── settings ──────────────────────────────────────────────────────────────────────────────

export type Locale = 'fr' | 'en';

export interface UiSettings {
  locale: Locale;
  theme: 'dark' | 'light';
}
