// plans/TECHNICAL-DESIGN.md §4.3. Exporters stream: one `sink.write` per record, never a
// concatenated string. Collecting the records out of the db is the caller's job — these modules
// only know how to shape and emit them.

export interface ExportSink {
  write(chunk: string | Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export const EXPORT_SCHEMA = 'cairn/export/1';

export interface ExportHeader {
  t: 'header';
  $schema: typeof EXPORT_SCHEMA | string;
  exportedAt: string;
  app: string;
  dbVersion: number;
  counts: Record<string, number>;
}

export interface CollectionRecord {
  t: 'collection';
  v: Record<string, unknown>;
}

export interface BookmarkRecord {
  t: 'bookmark';
  v: Record<string, unknown>;
  versions?: Record<string, unknown>[];
  chunks?: Record<string, unknown>[];
  tags?: Record<string, unknown>[];
}

export interface TagRecord {
  t: 'tag';
  v: Record<string, unknown>;
}

export interface OpRecord {
  t: 'op';
  v: Record<string, unknown>;
}

export type ExportRecord =
  | ExportHeader | CollectionRecord | BookmarkRecord | TagRecord | OpRecord;

/** The flat row the lossy exporters (Netscape, Markdown) consume. */
export interface BookmarkExportRow {
  id: string;
  url: string;
  title?: string;
  summary?: string;
  note?: string;
  tags: string[];
  /** ISO-8601. */
  createdAt?: string;
  folderPath?: string[];
  platform?: string;
  author?: string;
}

export type ExporterId = 'json' | 'netscape' | 'markdown';
