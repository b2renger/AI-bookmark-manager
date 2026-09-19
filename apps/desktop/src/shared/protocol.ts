// IPC contract shared by main, preload and renderer. Channel names are constants; every payload
// is typed here and nowhere else. Channels are added phase by phase (plans/TECHNICAL-DESIGN.md §2.2).
// P0 implements rows 1–6, 24–26, 32 of the channel table plus the three host-service channels
// (dialog × 2, shell) the import wizard and the library need.

export const IPC = {
  APP_INFO: 'app:info',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  LIB_QUERY: 'library:query',
  LIB_GET: 'library:get',
  LIB_SAVE_URLS: 'library:saveUrls',
  LIB_APPLY_OPS: 'library:applyOps',
  LIB_BULK_EDIT: 'library:bulkEdit',

  IMPORT_PREVIEW: 'import:preview',
  IMPORT_COMMIT: 'import:commit',
  IMPORT_PROGRESS: 'import:progress',

  EXPORT_RUN: 'export:run',

  DIALOG_OPEN_FILE: 'dialog:openFile',
  DIALOG_OPEN_DIR: 'dialog:openDir',
  SHELL_OPEN_EXTERNAL: 'shell:openExternal',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

export interface AppInfo {
  version: string;
  platform: string; // process.platform: win32 | darwin | linux
  arch: string;
  userDataPath: string;
  dbPath: string;
  locale: string;
  dev: boolean;
}

export type Locale = 'fr' | 'en';

export interface Settings {
  locale: Locale;
  theme: 'dark' | 'light';
}

// ── Library vocabulary ────────────────────────────────────────────────────────────────────

// Every vocabulary below mirrors a CHECK constraint in
// packages/core/src/db/migrations/0001_init.ts, and is declared as a runtime tuple so
// packages/core/test/library/dto.test.ts can assert the two lists are the same. The DDL is the
// truth; this file is its projection into the renderer.

/** String unions rather than enums so JSON straight out of SQLite is assignable as-is. */
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

export interface LibraryQuery {
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

// ── library:saveUrls (row 4) ──────────────────────────────────────────────────────────────

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

// ── library:applyOps (row 5) — structural mirror of @cairn/core OpInput ───────────────────

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

// ── library:bulkEdit (row 6) ──────────────────────────────────────────────────────────────

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

// ── import (rows 24–25) ───────────────────────────────────────────────────────────────────

export const IMPORTER_IDS = [
  'netscape', 'chrome', 'firefox', 'raindrop', 'karakeep', 'pocket', 'csv', 'notion',
] as const;
export type ImporterId = (typeof IMPORTER_IDS)[number];

/** Canonical destination fields the CSV/JSON column mapper targets. */
export type CanonicalField =
  | 'url' | 'title' | 'tags' | 'folderPath' | 'createdAt' | 'note' | 'ignore';

/** header name → canonical field. */
export type ColumnMapping = Record<string, CanonicalField>;

/** `path` means "the host reads the file itself" — a places.sqlite or a 200 MB export never
 *  crosses the IPC boundary as bytes. */
export interface ImportSource {
  kind: 'text' | 'bytes' | 'path';
  text?: string;
  bytes?: Uint8Array;
  path?: string;
}

export interface ImportPreviewRequest {
  kind: ImporterId | 'auto';
  source: ImportSource;
  mapping?: ColumnMapping;
}

export interface ImportSampleRow {
  url: string;
  title: string | null;
  tags: string[];
  folderPath: string | null;
  createdAt: string | null;
}

export interface ImportPreviewResponse {
  previewId: string;
  importer: ImporterId;
  total: number;
  newCount: number;
  duplicateCount: number;
  malformedCount: number;
  /** First 50 parsed rows, for the mapper preview. */
  sample: ImportSampleRow[];
  /** First 50 only — the full report lives in the run. */
  duplicates: { url: string; existingId: string }[];
  malformed: { raw: string; reason: string }[];
  detectedMapping?: ColumnMapping;
  headers?: string[];
}

export interface ImportCommitRequest {
  previewId: string;
  collectionId?: string;
  enqueueFetch: boolean;
}

export interface ImportCommitResponse {
  runId: string;
  inserted: number;
  skipped: number;
}

export type ImportPhase =
  | 'parsing' | 'deduping' | 'inserting' | 'indexing' | 'done' | 'error';

export interface ImportProgressEvent {
  /** The preview it belongs to before commit, the run id after. */
  previewId?: string;
  runId?: string;
  phase: ImportPhase;
  done: number;
  total: number;
  message?: string;
}

// ── export (row 26) ───────────────────────────────────────────────────────────────────────

export type ExportTarget = 'json' | 'netscape' | 'markdown' | 'db';

export interface ExportRequest {
  targets: ExportTarget[];
  dir: string;
}

export interface ExportResponse {
  files: { path: string; bytes: number }[];
}

// ── host services ─────────────────────────────────────────────────────────────────────────

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface OpenFileRequest {
  filters?: FileFilter[];
  /** Ask main to read the file and hand the bytes back (import of a small file). */
  withBytes?: boolean;
}

export interface OpenFileResult {
  path: string;
  bytes?: Uint8Array;
}

// ── the preload surface ───────────────────────────────────────────────────────────────────

export type Unsubscribe = () => void;

export interface CairnApi {
  app: {
    info(): Promise<AppInfo>;
  };
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<Settings>;
  };
  library: {
    query(query: LibraryQuery): Promise<Page<BookmarkRowDto>>;
    get(id: string): Promise<BookmarkDetailDto | null>;
    saveUrls(request: SaveUrlsRequest): Promise<SaveUrlsResponse>;
    applyOps(request: ApplyOpsRequest): Promise<ApplyOpsResponse>;
    bulkEdit(request: BulkEditRequest): Promise<BulkEditResponse>;
  };
  import: {
    preview(request: ImportPreviewRequest): Promise<ImportPreviewResponse>;
    commit(request: ImportCommitRequest): Promise<ImportCommitResponse>;
    onProgress(cb: (event: ImportProgressEvent) => void): Unsubscribe;
  };
  export: {
    run(request: ExportRequest): Promise<ExportResponse>;
  };
  dialog: {
    openFile(request?: OpenFileRequest): Promise<OpenFileResult | null>;
    openDir(): Promise<string | null>;
  };
  shell: {
    /** main validates the scheme; anything but http(s) resolves false and is never opened. */
    openExternal(url: string): Promise<boolean>;
  };
}
