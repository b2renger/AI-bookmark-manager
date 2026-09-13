// plans/TECHNICAL-DESIGN.md §4.2. Every importer is synchronous and pure: strings, bytes or rows
// in, plain objects out. No db, no fs, no network — the host does all of that and hands over the
// bytes.

export type ImporterId =
  | 'netscape' | 'chrome' | 'firefox' | 'raindrop' | 'karakeep' | 'pocket' | 'csv' | 'notion';

export interface BookmarkDraft {
  url: string;
  title?: string;
  note?: string;
  summary?: string;
  tags?: string[];
  folderPath?: string[];
  createdAt?: string;
  author?: string;
  /** Preserved verbatim into the bookmark's note metadata (e.g. Pocket `status`). */
  extra?: Record<string, unknown>;
}

export interface ImportSource {
  kind: 'text' | 'bytes' | 'rows';
  text?: string;
  bytes?: Uint8Array;
  rows?: Record<string, string>[];
}

export interface MalformedRow {
  line?: number;
  raw: string;
  reason: string;
}

export interface ImportResult {
  drafts: BookmarkDraft[];
  malformed: MalformedRow[];
  detected: {
    folders: number;
    tags: number;
    dateRange: [string, string] | null;
    /** Human label for the import summary UI, e.g. "Netscape bookmarks (HTML)". */
    sourceLabel: string;
  };
}

export interface Importer {
  id: ImporterId;
  /** 0..1 confidence, drives auto-detection. */
  sniff(src: ImportSource): number;
  /** SYNCHRONOUS and pure. */
  parse(src: ImportSource, opts?: unknown): ImportResult;
}
