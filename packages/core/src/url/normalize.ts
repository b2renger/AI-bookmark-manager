import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { URLClass, type UrlLike } from './global.js';

// plans/TECHNICAL-DESIGN.md §4.1. Port of legacy/App.tsx#stripUtmParams, widened: the whole
// tracking-parameter family, SPA-aware fragment handling and canonical platform rewrites.

export interface NormalizeOptions {
  /** utm_*, fbclid, gclid, … Default true. */
  stripTracking?: boolean;
  /** Default true, UNLESS the fragment is a SPA route (`#!/…`), which is part of the identity. */
  stripFragment?: boolean;
  /** Default true. The URL parser already does this; the flag keeps the contract explicit. */
  lowercaseHost?: boolean;
  /** Default false — some hosts 404 without `www.`; it is only ever dropped for the hash. */
  stripWww?: boolean;
  /** Default true. */
  sortQuery?: boolean;
  /** youtu.be/X → youtube.com/watch?v=X; x.com → twitter.com; m.<host> → <host>. Default true. */
  canonicalPlatform?: boolean;
}

export interface NormalizedUrl {
  /** The original, only WHATWG-canonicalised. Keeping it is what makes export lossless. */
  url: string;
  /** The identity string: what dedupe compares and what the hash is taken over. */
  norm: string;
  /** blake3(norm) hex, first 32 chars — `bookmarks.url_hash`. */
  hash: string;
  /** Host of `norm` (lowercase, punycode). */
  host: string;
  /** Pragmatic eTLD+1. */
  registrable: string;
}

/** Exact parameter names dropped from the normalised form. */
export const TRACKING_PARAMS: readonly string[] = [
  'fbclid', 'gclid', 'dclid', 'mc_cid', 'mc_eid', 'igshid', 'ref', 'ref_src', 'si', 'spm',
  'yclid', '_hsenc', '_hsmi', 'mkt_tok', 'msclkid', 'twclid', 'vero_id', 'oly_enc_id',
  'oly_anon_id', 'wickedid', 'hsa_cam', 'trk', 'trkCampaign',
];
const TRACKING_SET = new Set(TRACKING_PARAMS);

/** Two-label public suffixes we treat as one, so `registrable` keeps three labels under them. */
export const SECOND_LEVEL_SUFFIXES: readonly string[] = [
  'co.uk', 'com.au', 'co.jp', 'com.br', 'org.uk', 'ac.uk', 'gov.uk', 'co.nz', 'com.mx', 'co.za',
];
const SECOND_LEVEL_SET = new Set(SECOND_LEVEL_SUFFIXES);

const DEFAULTS: Required<NormalizeOptions> = {
  stripTracking: true,
  stripFragment: true,
  lowercaseHost: true,
  stripWww: false,
  sortQuery: true,
  canonicalPlatform: true,
};

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const WEB_SCHEMES = new Set(['http:', 'https:']);

export class InvalidUrlError extends Error {
  constructor(public readonly raw: string) {
    super(`not a URL: ${raw.slice(0, 120)}`);
    this.name = 'InvalidUrlError';
  }
}

/** Adds a scheme to bare hosts (`example.com/a` → `https://example.com/a`) and trims. */
export function coerceToAbsolute(raw: string): string {
  const s = raw.trim();
  if (!s) throw new InvalidUrlError(raw);
  if (SCHEME_RE.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  return `https://${s}`;
}

function parse(raw: string): UrlLike {
  try {
    return new URLClass(coerceToAbsolute(raw));
  } catch {
    throw new InvalidUrlError(raw);
  }
}

/** Cheap, allocation-light guard used by sniffers and the paste path. */
export function isProbablyUrl(s: string): boolean {
  const t = s.trim();
  if (!t || /\s/.test(t)) return false;
  let u: UrlLike;
  try {
    u = new URLClass(coerceToAbsolute(t));
  } catch {
    return false;
  }
  if (!WEB_SCHEMES.has(u.protocol)) return SCHEME_RE.test(t);
  if (u.hostname === 'localhost') return true;
  if (!u.hostname.includes('.')) return false;
  // A bare `foo.md` or `1.5` is not a URL; require a plausible TLD.
  return /\.[a-z]{2,}$/i.test(u.hostname) || /^\[?[0-9a-f:.]+\]?$/i.test(u.hostname);
}

/** Pragmatic eTLD+1: last two labels, or three under a known second-level suffix. */
export function registrableDomain(host: string): string {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h.includes('.')) return h;
  const labels = h.split('.');
  if (labels.every((l) => /^\d+$/.test(l))) return h; // IPv4
  const last2 = labels.slice(-2).join('.');
  if (labels.length > 2 && SECOND_LEVEL_SET.has(last2)) return labels.slice(-3).join('.');
  return last2;
}

function canonicalHost(u: UrlLike): void {
  const host = u.hostname;
  if (host === 'youtu.be') {
    const id = u.pathname.replace(/^\/+/, '').split('/')[0] ?? '';
    if (id) {
      u.hostname = 'youtube.com';
      u.pathname = '/watch';
      u.searchParams.set('v', id);
    }
    return;
  }
  if (host === 'www.youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    u.hostname = 'youtube.com';
    return;
  }
  if (host === 'x.com' || host === 'www.x.com' || host === 'mobile.x.com') {
    u.hostname = 'twitter.com';
    return;
  }
  if (host === 'www.twitter.com' || host === 'mobile.twitter.com' || host === 'm.twitter.com') {
    u.hostname = 'twitter.com';
    return;
  }
  if (/(^|\.)wikipedia\.org$/.test(host)) {
    // fr.m.wikipedia.org → fr.wikipedia.org ; m.wikipedia.org → wikipedia.org
    u.hostname = host.replace(/(^|\.)m\./, '$1');
  }
}

export function normalizeUrl(raw: string, opts?: NormalizeOptions): NormalizedUrl {
  const o = { ...DEFAULTS, ...opts };
  const original = parse(raw);
  const u = new URLClass(original.href);

  // Non-web schemes (mailto:, magnet:, file:) have no host/query structure worth rewriting.
  if (!WEB_SCHEMES.has(u.protocol)) {
    const normOther = o.stripFragment && !isRouteFragment(u.hash)
      ? u.href.replace(/#.*$/, '')
      : u.href;
    return {
      url: original.href,
      norm: normOther,
      hash: bytesToHex(blake3(utf8ToBytes(normOther))).slice(0, 32),
      host: u.hostname,
      registrable: registrableDomain(u.hostname),
    };
  }

  if (o.canonicalPlatform) canonicalHost(u);

  // The URL parser already lowercases and punycodes the host; honour the opt-out anyway.
  if (!o.lowercaseHost) u.hostname = original.hostname;
  if (o.stripWww && u.hostname.startsWith('www.')) u.hostname = u.hostname.slice(4);

  if (o.stripTracking && u.search) {
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_') || TRACKING_SET.has(key)) u.searchParams.delete(key);
    }
  }
  if (o.sortQuery && u.search) u.searchParams.sort();

  // Trailing slash is meaningless on a non-root path.
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.replace(/\/+$/, '');
    if (u.pathname === '') u.pathname = '/';
  }

  const keepFragment = !o.stripFragment || isRouteFragment(u.hash);
  const port = u.port ? `:${u.port}` : '';
  const auth = u.username ? `${u.username}${u.password ? `:${u.password}` : ''}@` : '';
  const norm =
    `${u.protocol}//${auth}${u.hostname}${port}${u.pathname === '/' ? '/' : u.pathname}` +
    `${u.search}${keepFragment ? u.hash : ''}`;

  return {
    url: original.href,
    norm,
    hash: bytesToHex(blake3(utf8ToBytes(norm))).slice(0, 32),
    host: u.hostname,
    registrable: registrableDomain(u.hostname),
  };
}

/** `#!/route` (and `#/route`) identify a page; a plain `#anchor` does not. */
export function isRouteFragment(hash: string): boolean {
  return hash.startsWith('#!/') || hash.startsWith('#/');
}
