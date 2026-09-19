import type { DbHandle } from '../ports/index.js';
import type { BookmarkDetailDto, ContentVersionDto } from './dto.js';
import { tagsForBookmarks, toRowDto } from './query.js';

// library:get (channel 3): the row, its note, the CURRENT content version and the chunk count.
// Nothing is joined in the list query that only the drawer needs.

interface DetailRaw {
  id: string;
  collection_id: string;
  url: string;
  url_norm: string;
  title: string | null;
  summary: string | null;
  summary_kind: string;
  platform: string | null;
  lang: string | null;
  status: string;
  starred: number;
  confidence: number | null;
  confidence_reason: string | null;
  acquisition_method: string | null;
  thumbnail_url: string | null;
  author: string | null;
  created_at: string;
  updated_at: string;
  open_count: number;
  note: string | null;
  current_version_id: string | null;
}

interface VersionRaw {
  method: string | null;
  tier: number;
  fetched_at: string;
  text_len: number;
  confidence: number | null;
  confidence_reason: string | null;
}

export function getBookmarkDetail(db: DbHandle, id: string): BookmarkDetailDto | null {
  const row = db
    .prepare(
      `SELECT b.id, b.collection_id, b.url, b.url_norm, b.title, b.summary, b.summary_kind,
              b.platform, b.lang, b.status, b.starred, b.confidence, b.confidence_reason,
              b.acquisition_method, b.thumbnail_url, b.author, b.created_at, b.updated_at,
              b.open_count, b.note, b.current_version_id
         FROM bookmarks b
        WHERE b.id = ? AND b.deleted_at IS NULL`,
    )
    .get<DetailRaw>(id);
  if (!row) return null;

  const tags = tagsForBookmarks(db, [id]).get(id) ?? [];
  const detail: BookmarkDetailDto = {
    ...toRowDto(row, tags),
    note: row.note,
    chunkCount: 0,
  };

  if (row.current_version_id !== null) {
    const version = db
      .prepare(
        `SELECT method, tier, fetched_at, LENGTH(COALESCE(text,'')) AS text_len,
                confidence, confidence_reason
           FROM content_versions WHERE id = ?`,
      )
      .get<VersionRaw>(row.current_version_id);
    if (version) {
      const dto: ContentVersionDto = {
        method: version.method,
        tier: version.tier,
        fetchedAt: version.fetched_at,
        textLen: version.text_len,
        confidence: version.confidence,
        confidenceReason: version.confidence_reason,
      };
      detail.currentVersion = dto;
    }
    detail.chunkCount =
      db
        .prepare('SELECT COUNT(*) AS n FROM chunks WHERE version_id = ?')
        .get<{ n: number }>(row.current_version_id)?.n ?? 0;
  }
  return detail;
}
