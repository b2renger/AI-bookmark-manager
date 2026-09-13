import {
  AtSignIcon,
  FileTextIcon,
  GitHubIcon,
  GlobeIcon,
  PdfIcon,
  XTwitterIcon,
  YouTubeIcon,
} from './icons/index.js';
import type { PlatformKey, PlatformVariant, TFn } from './types.js';

// Port of the PlatformBadge inside legacy/components/BookmarkItem.tsx, plus `pdf`. The stored
// `platform` column wins when present; the URL is the fallback (and always decides the YouTube
// sub-kind, which is not stored).

export interface DetectedPlatform {
  key: PlatformKey;
  variant: PlatformVariant;
}

export function detectPlatform(url: string, platform?: string | null): DetectedPlatform {
  const u = (url || '').toLowerCase();
  const isYouTube = platform === 'youtube' || u.includes('youtube.com') || u.includes('youtu.be');
  if (isYouTube) {
    const variant: PlatformVariant = u.includes('/shorts/')
      ? 'short'
      : u.includes('list=') || u.includes('/playlist')
        ? 'playlist'
        : 'video';
    return { key: 'youtube', variant };
  }
  if (platform === 'threads' || u.includes('threads.net') || u.includes('threads.com')) {
    return { key: 'threads', variant: null };
  }
  if (
    platform === 'twitter' ||
    u.includes('twitter.com') ||
    u.includes('//x.com') ||
    u.includes('.x.com') ||
    u.startsWith('x.com')
  ) {
    return { key: 'twitter', variant: null };
  }
  if (platform === 'github' || u.includes('github.com')) return { key: 'github', variant: null };
  if (platform === 'pdf' || /\.pdf(?:[?#]|$)/.test(u)) return { key: 'pdf', variant: null };
  if (platform === 'article') return { key: 'article', variant: null };
  return { key: 'website', variant: null };
}

const TONE: Record<PlatformKey, string> = {
  youtube: 'border-danger/40 bg-danger/10 text-danger',
  threads: 'border-line-2 bg-surface-2 text-fg-1',
  twitter: 'border-info/40 bg-info/10 text-info',
  github: 'border-line-2 bg-surface-2 text-fg-1',
  article: 'border-accent/40 bg-accent/10 text-accent',
  website: 'border-line-1 bg-surface-2 text-fg-2',
  pdf: 'border-warn/40 bg-warn/10 text-warn',
};

const ICON: Record<PlatformKey, typeof GlobeIcon> = {
  youtube: YouTubeIcon,
  threads: AtSignIcon,
  twitter: XTwitterIcon,
  github: GitHubIcon,
  article: FileTextIcon,
  website: GlobeIcon,
  pdf: PdfIcon,
};

/** Flat keys: `platform.youtube` must stay a leaf, so the variants cannot nest under it. */
const VARIANT_KEY: Record<Exclude<PlatformVariant, null>, string> = {
  video: 'platform.youtubeVideo',
  short: 'platform.youtubeShort',
  playlist: 'platform.youtubePlaylist',
};

export interface PlatformBadgeProps {
  t: TFn;
  url: string;
  platform?: string | null;
  author?: string | null;
  /** Icon only, for the table's narrow column. */
  compact?: boolean;
}

function handle(author: string): string {
  return author.startsWith('@') ? author : `@${author}`;
}

export function PlatformBadge({ t, url, platform, author, compact = false }: PlatformBadgeProps) {
  const { key, variant } = detectPlatform(url, platform);
  const Icon = ICON[key];
  const label = variant ? t(VARIANT_KEY[variant]) : t(`platform.${key}`);
  const withHandle = key === 'threads' || key === 'twitter';

  if (compact) {
    return (
      <span data-testid="platform-badge" data-platform={key} data-variant={variant ?? ''} title={label}>
        <Icon className="h-4 w-4" label={label} />
      </span>
    );
  }

  return (
    <span
      data-testid="platform-badge"
      data-platform={key}
      data-variant={variant ?? ''}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${TONE[key]}`}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
      {author ? (
        <span className="font-normal opacity-80">{withHandle ? handle(author) : author}</span>
      ) : null}
    </span>
  );
}
