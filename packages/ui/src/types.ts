// Shared prop vocabulary for @cairn/ui. The package never imports the desktop protocol: it
// declares the *shape* it needs, and apps/desktop's DTOs are structurally assignable to it.
// That keeps the package renderable in Vitest + happy-dom and in a future PWA.

/** The translator, passed as a prop. No component here initialises i18next. */
export type TFn = (key: string, opts?: Record<string, unknown>) => string;

export interface TagRef {
  id: string;
  label: string;
  source?: string;
  accepted?: boolean;
}

export interface BookmarkRow {
  id: string;
  url: string;
  title: string | null;
  summary: string | null;
  platform: string | null;
  status: string;
  starred: boolean;
  confidence: number | null;
  confidenceReason: string | null;
  author: string | null;
  createdAt: string;
  updatedAt: string;
  tags: TagRef[];
}

export interface BookmarkDetail extends BookmarkRow {
  note: string | null;
}

export interface FacetCount {
  key: string;
  count: number;
}

export type SortKey = 'created_desc' | 'created_asc' | 'title' | 'confidence_desc' | 'updated_desc';

export const SORT_KEYS: readonly SortKey[] = [
  'created_desc',
  'created_asc',
  'title',
  'confidence_desc',
  'updated_desc',
] as const;

/** The seven platforms PlatformBadge knows about. */
export type PlatformKey =
  | 'youtube' | 'threads' | 'twitter' | 'github' | 'article' | 'website' | 'pdf';

/** YouTube renders a sub-kind; everything else renders its platform name. */
export type PlatformVariant = 'video' | 'short' | 'playlist' | null;
