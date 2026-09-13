import type { Random } from '../ports/index.js';

// Fractional indexing (David Greenspan's algorithm as implemented in `fractional-indexing`, MIT),
// over base-62 digits, plus a random "jitter" suffix (`fractional-indexing-jittered`) so two peers
// inserting between the same neighbours concurrently get different keys and interleave
// deterministically instead of colliding. Plain string comparison is the sort. Matches LoroTree's
// ordering contract (plans/TECHNICAL-DESIGN.md §3.6).
//
// Key = integer part + fractional part.
//   integer part: head char gives the length — 'a'..'z' = positive, 2..27 digits; 'A'..'Z' =
//   negative, 27..2 digits — so appending at the end grows logarithmically, never linearly.
//   fractional part: base-62 digits, never ending in '0'.

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;
const ZERO = DIGITS[0]!;
const LAST = DIGITS[BASE - 1]!;
const INTEGER_ZERO = 'a0';
const SMALLEST_INTEGER = 'A00000000000000000000000000';
const JITTER_LEN = 4;

function digitIndex(c: string): number {
  const d = DIGITS.indexOf(c);
  if (d < 0) throw new Error(`fracIndex: invalid character ${JSON.stringify(c)}`);
  return d;
}

function integerLength(head: string): number {
  if (head >= 'a' && head <= 'z') return head.charCodeAt(0) - 'a'.charCodeAt(0) + 2;
  if (head >= 'A' && head <= 'Z') return 'Z'.charCodeAt(0) - head.charCodeAt(0) + 2;
  throw new Error(`fracIndex: invalid key head ${JSON.stringify(head)}`);
}

function integerPart(key: string): string {
  const len = integerLength(key[0] ?? '');
  if (len > key.length) throw new Error(`fracIndex: invalid key ${key}`);
  return key.slice(0, len);
}

function validateInteger(int: string): void {
  if (int.length !== integerLength(int[0] ?? '')) throw new Error(`fracIndex: invalid integer part ${int}`);
}

function validateKey(key: string): void {
  if (key === SMALLEST_INTEGER) throw new Error(`fracIndex: invalid key ${key}`);
  const i = integerPart(key);
  const f = key.slice(i.length);
  for (const c of key.slice(1)) digitIndex(c);
  if (f.endsWith(ZERO)) throw new Error(`fracIndex: fraction must not end in '${ZERO}': ${key}`);
}

/** Fraction strictly between a and b; '' is 0, null is 1. Precondition a < b, neither ends in '0'. */
function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) throw new Error(`fracIndex: ${JSON.stringify(a)} >= ${JSON.stringify(b)}`);
  if (a.endsWith(ZERO) || (b !== null && b.endsWith(ZERO))) throw new Error('fracIndex: trailing zero');
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? ZERO) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const da = a.length > 0 ? digitIndex(a[0]!) : 0;
  const db = b !== null ? digitIndex(b[0]!) : BASE;
  if (db - da > 1) return DIGITS[Math.round(0.5 * (da + db))]!;
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[da]! + midpoint(a.slice(1), null);
}

function incrementInteger(x: string): string | null {
  validateInteger(x);
  const head = x[0]!;
  const digs = x.slice(1).split('');
  let carry = true;
  for (let i = digs.length - 1; carry && i >= 0; i--) {
    const d = digitIndex(digs[i]!) + 1;
    if (d === BASE) digs[i] = ZERO;
    else {
      digs[i] = DIGITS[d]!;
      carry = false;
    }
  }
  if (!carry) return head + digs.join('');
  if (head === 'Z') return 'a' + ZERO;
  if (head === 'z') return null;
  const h = String.fromCharCode(head.charCodeAt(0) + 1);
  if (h > 'a') digs.push(ZERO);
  else digs.pop();
  return h + digs.join('');
}

function decrementInteger(x: string): string | null {
  validateInteger(x);
  const head = x[0]!;
  const digs = x.slice(1).split('');
  let borrow = true;
  for (let i = digs.length - 1; borrow && i >= 0; i--) {
    const d = digitIndex(digs[i]!) - 1;
    if (d === -1) digs[i] = LAST;
    else {
      digs[i] = DIGITS[d]!;
      borrow = false;
    }
  }
  if (!borrow) return head + digs.join('');
  if (head === 'a') return 'Z' + LAST;
  if (head === 'A') return null;
  const h = String.fromCharCode(head.charCodeAt(0) - 1);
  if (h < 'Z') digs.push(LAST);
  else digs.pop();
  return h + digs.join('');
}

/** The un-jittered key strictly between a and b (null = open end). */
export function generateKeyBetween(a: string | null, b: string | null): string {
  if (a !== null) validateKey(a);
  if (b !== null) validateKey(b);
  if (a !== null && b !== null && a >= b) throw new Error(`fracIndex: a >= b (${a} >= ${b})`);
  if (a === null) {
    if (b === null) return INTEGER_ZERO;
    const ib = integerPart(b);
    const fb = b.slice(ib.length);
    if (ib === SMALLEST_INTEGER) return ib + midpoint('', fb);
    if (ib < b) return ib;
    const res = decrementInteger(ib);
    if (res === null) throw new Error('fracIndex: cannot decrement any more');
    return res;
  }
  if (b === null) {
    const ia = integerPart(a);
    const fa = a.slice(ia.length);
    const i = incrementInteger(ia);
    return i === null ? ia + midpoint(fa, null) : i;
  }
  const ia = integerPart(a);
  const fa = a.slice(ia.length);
  const ib = integerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) return ia + midpoint(fa, fb);
  const i = incrementInteger(ia);
  if (i === null) throw new Error('fracIndex: cannot increment any more');
  if (i < b) return i;
  return ia + midpoint(fa, null);
}

function jitter(rnd: Random): string {
  const bytes = rnd.bytes(JITTER_LEN);
  let s = '';
  for (let i = 0; i < JITTER_LEN; i++) {
    const raw = bytes[i] ?? 0;
    const d = i === JITTER_LEN - 1 ? 1 + (raw % (BASE - 1)) : raw % BASE; // never end in '0'
    s += DIGITS[d]!;
  }
  return s;
}

/** A jittered key strictly between a and b; either may be null for the open end. */
export function keyBetween(a: string | null, b: string | null, rnd: Random): string {
  let key = generateKeyBetween(a, b);
  if (b !== null) {
    // When the algorithm answers with b's own integer part (b carries a fraction), any jitter
    // would land above b. Step one integer below instead so prepending stays logarithmic.
    const ib = integerPart(b);
    if (key === ib && (a === null || a < ib)) key = generateKeyBetween(a, ib);
  }
  // Jitter only ever pushes a key upward. If it would still cross b, move closer to b and retry;
  // after a few tries return the un-jittered key, which is strictly inside by construction.
  for (let attempt = 0; attempt < 4; attempt++) {
    const jittered = key + jitter(rnd);
    if (b === null || jittered < b) return jittered;
    key = generateKeyBetween(key, b);
  }
  return key;
}

export function keyAfter(a: string | null, rnd: Random): string {
  return keyBetween(a, null, rnd);
}

export function keyBefore(b: string | null, rnd: Random): string {
  return keyBetween(null, b, rnd);
}

export function compareFracIndex(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
