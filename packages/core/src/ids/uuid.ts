import type { Clock, Random } from '../ports/index.js';

// UUIDv7 (RFC 9562): 48-bit ms timestamp | ver=7 | 12-bit sub-ms counter | var=10 | 62 random bits.
// Time-ordered, so a PRIMARY KEY on it is also a creation-order index. Monotonic within one
// millisecond via the 12-bit counter; the counter reseeds on every new millisecond so two ids
// minted in the same ms from different processes still differ in their random tail.
// Deterministic given an injected Clock + Random, which is what makes op logs snapshot-testable.

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let lastMs = -1;
let counter = 0;

const HEX = '0123456789abcdef';
function hex(bytes: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end; i++) {
    const b = bytes[i] ?? 0;
    s += HEX[b >> 4]! + HEX[b & 15]!;
  }
  return s;
}

export function uuidv7(clock: Clock, random: Random): string {
  let ms = clock.now();
  if (ms < lastMs) ms = lastMs; // never go backwards inside one process
  if (ms === lastMs) {
    counter = (counter + 1) & 0xfff;
    if (counter === 0) {
      // 4096 ids in one ms: borrow the next millisecond (RFC 9562 §6.2 method 3)
      ms = ++lastMs;
    }
  } else {
    lastMs = ms;
    counter = random.bytes(2).reduce((a, b) => (a << 8) | b, 0) & 0x7ff; // start low: room to count
  }

  const b = new Uint8Array(16);
  // 48-bit timestamp, big-endian
  b[0] = (ms / 2 ** 40) & 0xff;
  b[1] = (ms / 2 ** 32) & 0xff;
  b[2] = (ms / 2 ** 24) & 0xff;
  b[3] = (ms / 2 ** 16) & 0xff;
  b[4] = (ms / 2 ** 8) & 0xff;
  b[5] = ms & 0xff;
  // version 7 + 12-bit counter
  b[6] = 0x70 | ((counter >> 8) & 0x0f);
  b[7] = counter & 0xff;
  const r = random.bytes(8);
  for (let i = 0; i < 8; i++) b[8 + i] = r[i] ?? 0;
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 10

  return `${hex(b, 0, 4)}-${hex(b, 4, 6)}-${hex(b, 6, 8)}-${hex(b, 8, 10)}-${hex(b, 10, 16)}`;
}

export function isUuidv7(s: string): boolean {
  return UUID_V7_RE.test(s);
}

/** Milliseconds since epoch encoded in a v7 id. */
export function uuidTime(id: string): number {
  const h = id.replace(/-/g, '').slice(0, 12);
  return parseInt(h, 16);
}

/** Test hook: reset the per-process monotonic state. */
export function _resetUuidState(): void {
  lastMs = -1;
  counter = 0;
}
