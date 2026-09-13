import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Firewall A and B as a TEST, because a lint rule can be disabled in a commit nobody reads.
// (plans/TECHNICAL-DESIGN.md §1.4)

const SRC = join(import.meta.dirname, '..', 'src');
const NODE_BUILTINS = new Set([
  'fs', 'path', 'os', 'crypto', 'child_process', 'worker_threads', 'http', 'https', 'net', 'tls',
  'zlib', 'stream', 'buffer', 'util', 'events', 'url', 'process', 'dns', 'v8', 'perf_hooks',
  'fs/promises', 'stream/promises', 'timers', 'timers/promises', 'assert', 'module',
]);
const HOST_ONLY = ['electron', 'better-sqlite3', 'sqlite-vec', 'onnxruntime-node', 'node-llama-cpp',
  'undici', '@number0/iroh', 'electron-updater', 'react', 'react-dom', '@cairn/ui'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const specs: string[] = [];
  for (const m of text.matchAll(IMPORT_RE)) specs.push((m[1] ?? m[2] ?? m[3] ?? m[4])!);
  return specs;
}

describe('architecture invariants', () => {
  const files = walk(SRC);

  it('no module in core imports a node builtin or a host-only dependency', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const spec of importsOf(f)) {
        const bare = spec.replace(/^node:/, '');
        if (spec.startsWith('node:') || NODE_BUILTINS.has(bare) || HOST_ONLY.some((h) => spec === h || spec.startsWith(h + '/'))) {
          offenders.push(`${relative(SRC, f)} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the save path cannot reach the generation provider', () => {
    // BFS over relative imports starting from the save pipeline; nothing reachable may live under
    // src/generation/. Passes vacuously until pipeline/save exists (P1), and is then load-bearing.
    const start = join(SRC, 'pipeline', 'save');
    let roots: string[] = [];
    try { roots = walk(start); } catch { /* not created yet */ }
    const seen = new Set<string>();
    const queue = [...roots];
    while (queue.length) {
      const f = queue.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      for (const spec of importsOf(f)) {
        if (!spec.startsWith('.')) continue;
        const base = join(f, '..', spec.replace(/\.js$/, ''));
        for (const cand of [base + '.ts', base + '.tsx', join(base, 'index.ts')]) {
          try { statSync(cand); queue.push(cand); break; } catch { /* try next */ }
        }
      }
    }
    const reached = [...seen].map((f) => relative(SRC, f).replace(/\\/g, '/'));
    expect(reached.filter((m) => m.startsWith('generation/'))).toEqual([]);
  });
});
