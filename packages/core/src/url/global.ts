// core compiles against lib ES2023 with `types: []` (no DOM, no @types/node), so the WHATWG URL
// global is typed structurally here — the same trick ports/index.ts uses for Web Crypto.

export interface UrlSearchParamsLike {
  keys(): IterableIterator<string>;
  entries(): IterableIterator<[string, string]>;
  get(name: string): string | null;
  getAll(name: string): string[];
  set(name: string, value: string): void;
  append(name: string, value: string): void;
  delete(name: string): void;
  sort(): void;
  toString(): string;
}

export interface UrlLike {
  protocol: string;
  username: string;
  password: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  href: string;
  origin: string;
  readonly searchParams: UrlSearchParamsLike;
  toString(): string;
}

interface UrlCtor {
  new (input: string, base?: string): UrlLike;
}

export const URLClass: UrlCtor = (globalThis as unknown as { URL: UrlCtor }).URL;
