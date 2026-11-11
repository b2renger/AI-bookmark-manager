import { proxyFetch } from '../lib/proxyFetch';
import { Evidence, PageContext, Platform, ReaderMode } from './ai/types';

/**
 * Collects whatever can be learned about a URL from inside the browser.
 *
 * A static site cannot fetch arbitrary pages (CORS), so this is a chain of
 * best-effort sources: public embed endpoints that allow browser calls, an
 * optional reader service, and an optional user-supplied proxy. Each source
 * reports honestly whether it produced the real content or only metadata;
 * that is what the confidence shown to the user is built from.
 */

const FETCH_TIMEOUT_MS = 12_000;
const READER_TIMEOUT_MS = 30_000;
const MAX_TEXT_CHARS = 30_000;
/** Below this, extracted "page text" is treated as metadata, not content. */
const MIN_CONTENT_CHARS = 400;

const NONE: PageContext = { evidence: 'none', text: '', label: 'nothing retrieved' };

export interface ContextOptions {
  xApiKey?: string;
  /** '' means no proxy: only endpoints that allow browser calls will work. */
  proxyUrl?: string;
  reader: ReaderMode;
  jinaKey?: string;
  /**
   * False when the AI provider fetches the page itself. Platform metadata is
   * still collected, because provider-side fetching does not cover everything.
   */
  needPageText: boolean;
}

export function detectPlatform(url: string): Platform {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'website';
  }
  const is = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (is('youtube.com') || is('youtu.be')) return 'youtube';
  if (is('threads.net') || is('threads.com')) return 'threads';
  if (is('twitter.com') || is('x.com')) return 'twitter';
  if (is('github.com')) return 'github';
  return 'website';
}

export function youtubeVideoId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  return m ? m[1] : null;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, proxyUrl?: string, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await proxyFetch(url, { ...options, signal: controller.signal }, proxyUrl);
  } finally {
    clearTimeout(id);
  }
}

function htmlToText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

function ctx(evidence: Evidence, label: string, text: string): PageContext {
  return { evidence, label, text: text.slice(0, MAX_TEXT_CHARS) };
}

// ---------------------------------------------------------------------------
// X / Twitter
// ---------------------------------------------------------------------------

async function fetchTweetContext(url: string, apiKey?: string, proxyUrl?: string): Promise<PageContext | null> {
  const match = url.match(/(?:twitter\.com|x\.com)\/(?:#!\/)?(\w+)\/status\/(\d+)/);
  if (!match) return null;
  const authorHandle = match[1];
  const tweetId = match[2];

  // The official API refuses browser calls, so it is only tried through a proxy.
  if (apiKey && proxyUrl) {
    try {
      const apiUrl = `https://api.x.com/2/tweets/${tweetId}?tweet.fields=text,created_at,author_id`;
      const res = await fetchWithTimeout(apiUrl, { headers: { Authorization: `Bearer ${apiKey.trim().replace(/^Bearer\s+/i, '')}` } }, proxyUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.data?.text) {
          return ctx('content', 'X API', `X/Twitter post\n- Author: @${authorHandle}\n- Text: "${data.data.text}"\n- Publication date: ${data.data.created_at || 'unknown'}`);
        }
      }
    } catch {
      /* fall through */
    }
  }

  try {
    // The syndication endpoint expects a token derived from the tweet id.
    const token = ((Number(tweetId) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
    const res = await fetchWithTimeout(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${token}`, {}, proxyUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.text) {
        return ctx('content', 'X syndication', `X/Twitter post\n- Author: @${data.user?.screen_name || authorHandle}\n- Text: "${data.text}"\n- Publication date: ${data.created_at || 'unknown'}`);
      }
    }
  } catch {
    /* fall through */
  }

  try {
    const res = await fetchWithTimeout(`https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(url)}`, {}, proxyUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.html) {
        return ctx('content', 'X embed', `X/Twitter post\n- Author: ${data.author_name || authorHandle}\n- Text: "${htmlToText(data.html)}"`);
      }
    }
  } catch {
    /* fall through */
  }

  return null;
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

async function fetchThreadsContext(url: string, proxyUrl?: string): Promise<PageContext | null> {
  const handleMatch = url.match(/(?:threads\.net|threads\.com)\/@([a-zA-Z0-9._]+)/i);
  const authorHandle = handleMatch ? handleMatch[1] : '';

  try {
    const res = await fetchWithTimeout(`https://www.threads.net/oembed?url=${encodeURIComponent(url)}`, {}, proxyUrl);
    if (res.ok) {
      const data = await res.json();
      const postText = data.html ? htmlToText(data.html) : String(data.title || '');
      if (postText) {
        return ctx('content', 'Threads embed', `Threads post\n- Author: @${data.author_name || authorHandle}\n- Text: "${postText}"`);
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

async function fetchYouTubeContext(url: string, proxyUrl?: string): Promise<PageContext | null> {
  const videoId = youtubeVideoId(url);
  const playlistId = url.match(/[?&]list=([^#&?]+)/)?.[1] ?? null;

  let oEmbed: any = null;
  const oEmbedUrls = [
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    // A public oEmbed relay that allows browser calls, for when YouTube's own does not.
    `https://noembed.com/embed?url=${encodeURIComponent(url)}`,
  ];
  for (const endpoint of oEmbedUrls) {
    try {
      const res = await fetchWithTimeout(endpoint, {}, proxyUrl);
      if (res.ok) {
        const data = await res.json();
        if (data?.title) {
          oEmbed = data;
          break;
        }
      }
    } catch {
      /* try the next one */
    }
  }

  let title = oEmbed?.title || '';
  let author = oEmbed?.author_name || '';
  let description = '';
  let keywords = '';
  let uploadDate = '';
  let playlist = '';

  // The watch page carries the description and date, but only a proxy can fetch it.
  if (proxyUrl) {
    try {
      const target = videoId
        ? `https://www.youtube.com/watch?v=${videoId}`
        : playlistId
          ? `https://www.youtube.com/playlist?list=${playlistId}`
          : url;
      const res = await fetchWithTimeout(target, {}, proxyUrl);
      if (res.ok) {
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const meta = (name: string) => metaContent(doc, name);
        title = title || meta('og:title') || (doc.title || '').replace(/- YouTube$/i, '').trim();
        description = meta('og:description') || meta('description') || '';
        keywords = meta('keywords') || '';
        uploadDate = meta('datePublished') || meta('uploadDate') || '';
        author = author || meta('name') || '';
        if (playlistId) {
          const matches = [...html.matchAll(/"playlistVideoRenderer":\{.*?"title":\{(?:.*?"text":"(.*?)".*?|.*?"simpleText":"(.*?)")/g)];
          const titles = [...new Set(matches.map((m) => m[1] || m[2]).filter(Boolean))].slice(0, 15);
          if (titles.length > 0) playlist = `\n- Playlist videos:\n  * ${titles.join('\n  * ')}`;
        }
      }
    } catch {
      /* oEmbed data only */
    }
  }

  if (!title && !author && !description) return null;

  const kind = playlistId ? 'playlist' : videoId ? (url.includes('/shorts/') ? 'short' : 'video') : 'channel';
  const lines = [
    `YouTube ${kind}`,
    `- Title: ${title}`,
    `- Channel: ${author}`,
    uploadDate ? `- Upload date: ${uploadDate}` : '',
    description ? `- Description: ${description.slice(0, 1500)}` : '',
    keywords ? `- Keywords: ${keywords}` : '',
  ].filter(Boolean);
  // A title and channel are metadata. The video itself was not watched.
  return ctx('metadata', description ? 'YouTube title, channel and description' : 'YouTube title and channel', lines.join('\n') + playlist);
}

// ---------------------------------------------------------------------------
// Generic pages
// ---------------------------------------------------------------------------

function metaContent(doc: Document, name: string): string {
  const el =
    doc.querySelector(`meta[property="${name}"]`) ||
    doc.querySelector(`meta[name="${name}"]`) ||
    doc.querySelector(`meta[itemprop="${name}"]`);
  return (el?.getAttribute('content') || '').trim();
}

/** Fetches the page through the user's proxy and extracts its readable text. */
async function fetchViaProxy(url: string, proxyUrl: string): Promise<PageContext | null> {
  try {
    const res = await fetchWithTimeout(url, {}, proxyUrl);
    if (!res.ok) return null;
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const title = metaContent(doc, 'og:title') || (doc.title || '').trim();
    const description = metaContent(doc, 'og:description') || metaContent(doc, 'description');
    const author = metaContent(doc, 'author') || metaContent(doc, 'article:author');
    const published = metaContent(doc, 'article:published_time') || metaContent(doc, 'date');

    doc.querySelectorAll('script, style, noscript, nav, header, footer, aside, form, svg, iframe').forEach((el) => el.remove());
    const root = doc.querySelector('article') || doc.querySelector('main') || doc.body;
    const bodyText = (root?.textContent || '').replace(/\s+/g, ' ').trim();

    const head = [
      title ? `Title: ${title}` : '',
      author ? `Author: ${author}` : '',
      published ? `Published: ${published}` : '',
      description ? `Description: ${description}` : '',
    ].filter(Boolean).join('\n');

    if (bodyText.length >= MIN_CONTENT_CHARS) {
      return ctx('content', 'page text via your proxy', `${head}\n\n${bodyText}`);
    }
    if (head) return ctx('metadata', 'page title and description via your proxy', head);
  } catch {
    /* nothing */
  }
  return null;
}

interface ReaderAttempt {
  /** HTTP status, or 0 when the browser could not complete the request. */
  status: number;
  text: string;
}

async function requestReader(url: string, jinaKey: string | undefined, timeoutMs: number): Promise<ReaderAttempt> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Without a key this is a "simple" request, so no CORS preflight is needed.
    const headers: Record<string, string> = {};
    if (jinaKey) headers.Authorization = `Bearer ${jinaKey}`;
    const res = await fetch(`https://r.jina.ai/${url}`, { headers, signal: controller.signal });
    return { status: res.status, text: (await res.text()).trim() };
  } catch {
    return { status: 0, text: '' };
  } finally {
    clearTimeout(id);
  }
}

/**
 * Jina Reader returns a page as plain text / Markdown.
 * The URL is sent to jina.ai, which the Settings screen says explicitly.
 *
 * If the request with a key fails for a reason tied to the key (rejected, or
 * blocked by the browser), it is retried without one: a wrong key should not
 * cost the user the free keyless service.
 */
async function fetchViaReader(url: string, jinaKey?: string): Promise<PageContext | null> {
  let attempt = await requestReader(url, jinaKey, READER_TIMEOUT_MS);
  if (jinaKey && (attempt.status === 0 || attempt.status === 401 || attempt.status === 403)) {
    attempt = await requestReader(url, undefined, READER_TIMEOUT_MS);
  }
  if (attempt.status < 200 || attempt.status >= 300) return null;
  if (attempt.text.length >= MIN_CONTENT_CHARS) return ctx('content', 'page text via Jina Reader', attempt.text);
  if (attempt.text.length > 0) return ctx('metadata', 'partial text via Jina Reader', attempt.text);
  return null;
}

export interface ReaderTestResult {
  ok: boolean;
  message: string;
}

/** Checks, from this browser, that Jina Reader answers and accepts the key. */
export async function testJinaReader(jinaKey?: string): Promise<ReaderTestResult> {
  const sample = 'https://example.com/';
  const looksRight = (a: ReaderAttempt) => a.status >= 200 && a.status < 300 && /example domain/i.test(a.text);
  const describe = (a: ReaderAttempt) =>
    a.status === 0 ? 'the browser could not complete the request' : `Jina answered with status ${a.status}`;

  if (jinaKey) {
    const keyed = await requestReader(sample, jinaKey, 25_000);
    if (looksRight(keyed)) {
      return { ok: true, message: `Success. Jina Reader accepted your key and returned the test page (${keyed.text.length} characters).` };
    }
    const keyless = await requestReader(sample, undefined, 25_000);
    if (keyed.status === 401 || keyed.status === 403) {
      return {
        ok: false,
        message: `Jina rejected this key (status ${keyed.status}). Check that it was copied completely.${looksRight(keyless) ? ' The Reader does work without a key, so pages will still be read at the lower free rate limit.' : ''}`,
      };
    }
    if (looksRight(keyless)) {
      return {
        ok: false,
        message: `The Reader works without a key, but the request with your key failed (${describe(keyed)}). Pages will still be read at the lower free rate limit.`,
      };
    }
    return { ok: false, message: `Jina Reader could not be reached from this browser (${describe(keyless)}). Check your connection or any content blocker.` };
  }

  const keyless = await requestReader(sample, undefined, 25_000);
  if (looksRight(keyless)) {
    return { ok: true, message: `Success. Jina Reader works without a key (${keyless.text.length} characters returned). A key only raises the rate limit.` };
  }
  if (keyless.status === 429) {
    return { ok: false, message: 'Jina Reader answered "too many requests". Wait a minute, or add a key to raise the limit.' };
  }
  return { ok: false, message: `Jina Reader could not be reached from this browser (${describe(keyless)}). Check your connection or any content blocker.` };
}

// ---------------------------------------------------------------------------

/** Best available context for one URL. Never throws. */
export async function collectContext(url: string, platform: Platform, opts: ContextOptions): Promise<PageContext> {
  const proxyUrl = opts.proxyUrl?.trim() || '';

  let platformContext: PageContext | null = null;
  if (platform === 'twitter') platformContext = await fetchTweetContext(url, opts.xApiKey, proxyUrl);
  else if (platform === 'threads') platformContext = await fetchThreadsContext(url, proxyUrl);
  else if (platform === 'youtube') platformContext = await fetchYouTubeContext(url, proxyUrl);

  if (platformContext?.evidence === 'content') return platformContext;
  if (!opts.needPageText) return platformContext ?? NONE;

  // YouTube watch pages have no article text worth reading; keep the metadata.
  if (platform === 'youtube' && platformContext) return platformContext;

  if (proxyUrl) {
    const viaProxy = await fetchViaProxy(url, proxyUrl);
    if (viaProxy?.evidence === 'content') return viaProxy;
    platformContext = platformContext ?? viaProxy;
  }

  if (opts.reader === 'jina') {
    const viaReader = await fetchViaReader(url, opts.jinaKey);
    if (viaReader?.evidence === 'content') return viaReader;
    platformContext = platformContext ?? viaReader;
  }

  return platformContext ?? NONE;
}
