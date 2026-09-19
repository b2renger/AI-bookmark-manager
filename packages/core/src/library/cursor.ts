// Pagination cursors. Two shapes, because two regimes:
//
//  * KEYSET (`{k, i}`) for every non-text sort. `k` is the row's sort-key value and `i` its id;
//    the next page is "strictly after (k, i)". Stable under concurrent inserts, O(index seek),
//    and it never re-reads or skips a row the way OFFSET does.
//  * OFFSET (`{o}`) for text search ONLY. bm25() is a whole-query ranking: the same row scores
//    differently as the corpus changes, and two rows can tie, so there is no per-row key that
//    orders the result set. Documented trade-off: a concurrent insert can shift a text-search
//    page by one row.
//
// Encoded as base64url over UTF-8 JSON, hand-rolled because core has no Buffer and no `btoa`
// (lib ES2023, types: []).

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const INVERSE: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) INVERSE[ALPHABET[i]!] = i;

function utf8Encode(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else {
      out.push(
        0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63),
      );
    }
  }
  return out;
}

function utf8Decode(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i]!;
    let cp: number;
    if (b < 0x80) { cp = b; i += 1; }
    else if (b < 0xe0) { cp = ((b & 31) << 6) | (bytes[i + 1]! & 63); i += 2; }
    else if (b < 0xf0) {
      cp = ((b & 15) << 12) | ((bytes[i + 1]! & 63) << 6) | (bytes[i + 2]! & 63);
      i += 3;
    } else {
      cp = ((b & 7) << 18) | ((bytes[i + 1]! & 63) << 12) | ((bytes[i + 2]! & 63) << 6) |
        (bytes[i + 3]! & 63);
      i += 4;
    }
    out += String.fromCodePoint(cp);
  }
  return out;
}

export function base64urlEncode(text: string): string {
  const bytes = utf8Encode(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += ALPHABET[b0 >> 2]!;
    out += ALPHABET[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]!;
    if (b1 === undefined) break;
    out += ALPHABET[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]!;
    if (b2 === undefined) break;
    out += ALPHABET[b2 & 63]!;
  }
  return out;
}

export function base64urlDecode(text: string): string {
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of text) {
    const v = INVERSE[ch];
    if (v === undefined) throw new Error('cursor: not base64url');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  return utf8Decode(bytes);
}

/** Keyset cursor: the last row's sort-key value and id. */
export interface KeysetCursor {
  k: string | number | null;
  i: string;
}

/** Offset cursor: text search only (see the note at the top of this file). */
export interface OffsetCursor {
  o: number;
}

export type Cursor = KeysetCursor | OffsetCursor;

export function isOffsetCursor(c: Cursor): c is OffsetCursor {
  return typeof (c as OffsetCursor).o === 'number';
}

export function encodeCursor(cursor: Cursor): string {
  return base64urlEncode(JSON.stringify(cursor));
}

/** Returns null for a malformed cursor — a stale link restarts the listing, it never throws. */
export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(base64urlDecode(raw));
    if (parsed === null || typeof parsed !== 'object') return null;
    const c = parsed as Record<string, unknown>;
    if (typeof c['o'] === 'number' && Number.isFinite(c['o'])) return { o: Math.max(0, c['o']) };
    if (typeof c['i'] === 'string') {
      const k = c['k'];
      if (k === null || typeof k === 'string' || typeof k === 'number') return { k, i: c['i'] };
    }
    return null;
  } catch {
    return null;
  }
}
