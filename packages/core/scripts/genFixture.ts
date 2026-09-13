// npm run fixture:gen -- --profile=scale --seed=42 --out=.fixtures/library-100k.db
// Run directly by Node 24 (native type stripping), so every construct here must be erasable:
// no enums, no namespaces, no parameter properties.
//
// Node does not remap a `.js` specifier onto a `.ts` file, and all of packages/core/src imports
// with `.js` extensions (the TypeScript convention). registerHooks() bridges that, which is why
// every core import below is a dynamic import placed after the hook is installed.

import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL?.endsWith('.ts')) {
      const asTs = specifier.slice(0, -3) + '.ts';
      if (existsSync(fileURLToPath(new URL(asTs, context.parentURL)))) {
        return nextResolve(asTs, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const require = createRequire(import.meta.url);

interface Args {
  profile: 'tiny' | 'ci' | 'scale';
  seed: number;
  out: string;
}

function parseArgs(argv: string[]): Args {
  let profile = 'ci';
  let seed = 42;
  let out = '';
  for (const arg of argv) {
    const m = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(arg);
    if (!m) continue;
    const value = m[2] ?? '';
    if (m[1] === 'profile') profile = value;
    else if (m[1] === 'seed') seed = Number(value);
    else if (m[1] === 'out') out = value;
  }
  if (profile !== 'tiny' && profile !== 'ci' && profile !== 'scale') {
    throw new Error(`--profile must be tiny | ci | scale (got ${profile})`);
  }
  if (!Number.isFinite(seed)) throw new Error('--seed must be a number');
  if (out === '') out = `.fixtures/library-${profile}.db`;
  return { profile, seed, out: resolve(process.cwd(), out) };
}

function human(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

const args = parseArgs(process.argv.slice(2));

const { applyConnectionPragmas } = await import('../src/db/pragmas.js');
const { migrate } = await import('../src/db/migrate.js');
const { vecAvailable } = await import('../src/db/vec.js');
const { generateFixture } = await import('./fixtureSql.js');
const { frozenClock } = await import('../test/helpers/clock.js');
const { seededRandom } = await import('../test/helpers/random.js');

type DbHandle = import('../src/ports/index.ts').DbHandle;
type SqlValue = import('../src/ports/index.ts').SqlValue;

const Database = require('better-sqlite3') as typeof import('better-sqlite3');

/** The DbHandle port over better-sqlite3. test/helpers/sqliteHandle.ts is the same adapter, but it
 *  uses a constructor parameter property, which Node's strip-only TypeScript mode rejects. */
function makeHandle(raw: import('better-sqlite3').Database): DbHandle {
  return {
    prepare(sql: string) {
      const st = raw.prepare(sql);
      return {
        all: <T,>(...p: SqlValue[]) => st.all(...p) as T[],
        get: <T,>(...p: SqlValue[]) => st.get(...p) as T | undefined,
        run: (...p: SqlValue[]) => st.run(...p),
        iterate: <T,>(...p: SqlValue[]) => st.iterate(...p) as IterableIterator<T>,
      };
    },
    exec: (sql: string) => { raw.exec(sql); },
    transaction: <A extends unknown[], R>(fn: (...args: A) => R) =>
      raw.transaction(fn) as unknown as (...args: A) => R,
    pragma: (statement: string) => raw.pragma(statement),
  };
}

mkdirSync(dirname(args.out), { recursive: true });
for (const suffix of ['', '-wal', '-shm']) rmSync(args.out + suffix, { force: true });

const raw = new Database(args.out);
const db = makeHandle(raw);
applyConnectionPragmas(db);
migrate(db);

try {
  const sqliteVec = require('sqlite-vec') as { load(d: import('better-sqlite3').Database): void };
  sqliteVec.load(raw);
} catch (err) {
  console.warn(`sqlite-vec unavailable, skipping vec_docs (${(err as Error).message})`);
}
const vec = vecAvailable(db);

console.log(`cairn fixture: profile=${args.profile} seed=${String(args.seed)} vec=${String(vec)}`);
console.log(`               out=${args.out}`);

const started = Date.now();
let lastPhase = '';
const stats = generateFixture(db, {
  profile: args.profile,
  seed: args.seed,
  clock: frozenClock('2026-01-01T00:00:00.000Z'),
  random: seededRandom(args.seed),
  onProgress: (done, total, phase) => {
    if (phase !== lastPhase) {
      if (lastPhase !== '') process.stdout.write('\n');
      lastPhase = phase;
    }
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    process.stdout.write(`\r  ${phase}: ${String(done)} / ${String(total)}  (${secs}s)   `);
  },
});
process.stdout.write('\n');

raw.pragma('wal_checkpoint(TRUNCATE)');
raw.pragma('optimize');
raw.close();

const bytes = statSync(args.out).size;
stats.bytes = bytes;

const { tagTruth, ...summary } = stats;
const sidecar = { ...summary, tagTruthEntries: Object.keys(tagTruth).length, out: args.out };
writeFileSync(`${args.out}.stats.json`, JSON.stringify(sidecar, null, 2) + '\n', 'utf8');

console.log(
  [
    `  bookmarks        ${String(stats.bookmarks)}`,
    `  tags (raw)       ${String(stats.tags)}  from ${String(stats.canonicalTags)} canonical`,
    `  bookmark_tags    ${String(stats.bookmarkTags)}`,
    `  content_versions ${String(stats.contentVersions)}`,
    `  chunks           ${String(stats.chunks)}`,
    `  embeddings       ${String(stats.embeddings)} × ${String(stats.dim)}d`,
    `  vec_docs         ${String(stats.vecRows)} × ${String(stats.vecDim)}d (available: ${String(stats.vecAvailable)})`,
    `  noise points     ${String(stats.noisePoints)}`,
    `  file             ${human(bytes)}`,
    `  elapsed          ${(stats.elapsedMs / 1000).toFixed(1)}s`,
    `  sidecar          ${args.out}.stats.json`,
  ].join('\n'),
);
