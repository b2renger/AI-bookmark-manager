import { blake3 } from '@noble/hashes/blake3.js';
import type { Clock } from '../ports/index.js';
import type { HlcGenerator } from './types.js';

// Hybrid logical clock (plans/TECHNICAL-DESIGN.md §3.5). One fixed-width, lexicographically
// sortable string:
//
//   <physical ms, base36, 10 chars, zero-padded> "." <counter, base36, 4> "." <actor, base58, 8>
//   example: 0m3k9tz7q1.001f.7pKq3nW2
//
// All three fields are fixed width over ordered alphabets, so PLAIN STRING COMPARISON is the total
// order — which is the whole merge rule, and which SQLite indexes directly.

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const PHYSICAL_LEN = 10;
const COUNTER_LEN = 4;
const ACTOR_LEN = 8;
const MAX_PHYSICAL = 36 ** PHYSICAL_LEN - 1; // base36^10, good past year 5000
const MAX_COUNTER = 36 ** COUNTER_LEN - 1; // 1 679 615 ops inside one millisecond

// §3.5 calls it "29 chars", but 10 + 1 + 4 + 1 + 8 = 24 — and the section's own example
// (0m3k9tz7q1.001f.7pKq3nW2) and its §3.4 regex are both 24. The field widths win; 29 is a typo.
export const HLC_LENGTH = PHYSICAL_LEN + COUNTER_LEN + ACTOR_LEN + 2; // 24

export interface ParsedHlc {
  physical: number;
  counter: number;
  actor: string;
}

function base58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]!;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = B58[0]!.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]!]!;
  return out;
}

/** UTF-8 bytes. Hand-rolled because core compiles against lib ES2023 only — no DOM, no @types/node,
 *  so no `TextEncoder` global to lean on. */
function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63),
      );
    }
  }
  return Uint8Array.from(out);
}

/** The actor short id: the first 8 base58 characters of the Ed25519 pubkey. Anything that cannot
 *  supply 8 (notably the empty pubkey before an identity exists, P6) falls back to a stable
 *  base58 digest of `'local:' + pubkey`, so the id is deterministic and tests are reproducible. */
export function actorShortId(pubkey: string): string {
  const clean = [...pubkey].filter((c) => B58.includes(c)).join('');
  if (clean.length >= ACTOR_LEN) return clean.slice(0, ACTOR_LEN);
  const seed = utf8(`local:${pubkey}`);
  return base58(blake3(seed, { dkLen: 16 })).slice(0, ACTOR_LEN).padEnd(ACTOR_LEN, B58[0]!);
}

function format(physical: number, counter: number, actor: string): string {
  if (physical < 0 || physical > MAX_PHYSICAL) throw new Error(`hlc: physical out of range ${physical}`);
  if (counter < 0 || counter > MAX_COUNTER) throw new Error(`hlc: counter overflow ${counter}`);
  return (
    Math.floor(physical).toString(36).padStart(PHYSICAL_LEN, '0') +
    '.' +
    counter.toString(36).padStart(COUNTER_LEN, '0') +
    '.' +
    actor
  );
}

export function parseHlc(hlc: string): ParsedHlc {
  const m = /^([0-9a-z]{10})\.([0-9a-z]{4})\.([1-9A-HJ-NP-Za-km-z]{8})$/.exec(hlc);
  if (!m) throw new Error(`hlc: malformed ${JSON.stringify(hlc)}`);
  return { physical: parseInt(m[1]!, 36), counter: parseInt(m[2]!, 36), actor: m[3]! };
}

export function isHlc(s: string): boolean {
  return /^[0-9a-z]{10}\.[0-9a-z]{4}\.[1-9A-HJ-NP-Za-km-z]{8}$/.test(s);
}

/** The total order. Fixed-width fields over ordered alphabets ⇒ plain string comparison. */
export function compareHlc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function createHlc(clock: Clock, actorPubkey: string): HlcGenerator {
  const actor = actorShortId(actorPubkey);
  let physical = 0;
  let counter = 0;
  let lastStr: string | null = null;

  return {
    next(): string {
      const now = clock.now();
      if (now > physical) {
        physical = now;
        counter = 0;
      } else {
        counter += 1; // frozen or backwards-running wall clock: the counter carries monotonicity
      }
      lastStr = format(physical, counter, actor);
      return lastStr;
    },

    receive(remote: string): void {
      const r = parseHlc(remote);
      const now = clock.now();
      const merged = Math.max(physical, r.physical, now);
      if (merged === physical && merged === r.physical) counter = Math.max(counter, r.counter) + 1;
      else if (merged === physical) counter += 1;
      else if (merged === r.physical) counter = r.counter + 1;
      else counter = 0;
      physical = merged;
      const mine = format(physical, counter, actor);
      lastStr = mine > remote ? mine : remote;
    },

    last(): string | null {
      return lastStr;
    },
  };
}
