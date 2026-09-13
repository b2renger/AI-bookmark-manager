// Ports: the only way core touches I/O. The host (apps/desktop/src/main) implements them with
// better-sqlite3, undici, the filesystem and Electron safeStorage; tests implement them with
// :memory: SQLite, fakes and a frozen clock. See plans/TECHNICAL-DESIGN.md §4.0.

export type SqlValue = null | number | bigint | string | Uint8Array;

export interface Statement {
  all<T = unknown>(...params: SqlValue[]): T[];
  get<T = unknown>(...params: SqlValue[]): T | undefined;
  run(...params: SqlValue[]): { changes: number; lastInsertRowid: number | bigint };
  iterate<T = unknown>(...params: SqlValue[]): IterableIterator<T>;
}

export interface DbHandle {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  /** Wraps fn in BEGIN/COMMIT (ROLLBACK on throw). Nested calls join the outer transaction. */
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R;
  pragma(statement: string): unknown;
}

export interface FetchResponse {
  status: number;
  headers: Record<string, string>;
  finalUrl: string;
  text(): Promise<string>;
  bytes(): Promise<Uint8Array>;
}

export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  timeoutMs?: number;
  redirect?: 'follow' | 'manual';
}

export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponse>;

/** Content-addressed blob store (BLAKE3 hex keys). Snapshots, bundles, model files. */
export interface FileStore {
  put(bytes: Uint8Array): Promise<{ hash: string; bytes: number }>;
  get(hash: string): Promise<Uint8Array | null>;
  has(hash: string): Promise<boolean>;
  delete(hash: string): Promise<void>;
  usage(): Promise<{ bytes: number; count: number }>;
}

export interface Clock {
  /** Milliseconds since the Unix epoch. */
  now(): number;
  /** ISO-8601 UTC with millisecond precision, e.g. 2026-09-13T10:22:03.117Z */
  iso(): string;
}

export interface Random {
  bytes(n: number): Uint8Array;
  /** Uniform in [0, 1). */
  float(): number;
}

export interface SecretStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
}

export interface Logger {
  debug(msg: string, data?: object): void;
  info(msg: string, data?: object): void;
  warn(msg: string, data?: object): void;
  error(msg: string, data?: object): void;
}

/** A real clock for hosts. Tests use test/helpers/clock.ts (frozen, tickable). */
export const systemClock: Clock = {
  now: () => Date.now(),
  iso: () => new Date().toISOString(),
};

/** A Web-Crypto-backed Random. Works in Node ≥ 20, browsers and workers without any import.
 *  core compiles against lib ES2023 only (no DOM, no @types/node), so the global is typed here. */
interface WebCryptoLike {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
}
const webCrypto = (globalThis as unknown as { crypto: WebCryptoLike }).crypto;

export const webRandom: Random = {
  bytes: (n) => {
    const out = new Uint8Array(n);
    webCrypto.getRandomValues(out);
    return out;
  },
  float: () => {
    const b = new Uint32Array(1);
    webCrypto.getRandomValues(b);
    return (b[0] ?? 0) / 4294967296;
  },
};

export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
