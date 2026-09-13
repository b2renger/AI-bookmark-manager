// Three firewalls (plans/TECHNICAL-DESIGN.md §1.4). Firewall B is ALSO an architecture test
// (packages/core/test/arch.invariants.test.ts) because a lint rule can be disabled in a commit
// nobody reads.
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';

const NODE_BUILTINS = [
  'fs', 'path', 'os', 'crypto', 'child_process', 'worker_threads', 'http', 'https', 'net', 'tls',
  'zlib', 'stream', 'buffer', 'util', 'events', 'url', 'process', 'dns', 'v8', 'perf_hooks',
  'fs/promises', 'stream/promises', 'timers', 'timers/promises', 'assert', 'module',
];

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/out/**', '**/dist/**', '**/release/**', 'legacy/**',
      '.fixtures/**', '**/*.generated.ts', 'apps/desktop/build/**'],
  },
  ...tseslint.configs.recommended,

  // ── A: packages/core is runtime-agnostic ───────────────────────────────────────────────
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['node:*', ...NODE_BUILTINS],
            message: 'packages/core must run in a browser/worker. Take a port (DbHandle, FetchLike, FileStore, Clock, Random, SecretStore) as an argument instead — see packages/core/src/ports/.',
          },
          {
            group: ['electron', 'electron/*', 'better-sqlite3', 'sqlite-vec', 'onnxruntime-node',
              'node-llama-cpp', 'undici', '@number0/iroh', 'electron-updater'],
            message: 'Host-only dependency. It belongs in apps/desktop/src/main.',
          },
          { group: ['@cairn/ui', 'react', 'react-dom'], message: 'core is headless.' },
        ],
      }],
    },
  },

  // ── B: THE INVARIANT — the save path cannot reach generation ──────────────────────────
  {
    files: ['packages/core/src/**/*.ts', 'apps/desktop/src/main/**/*.ts'],
    plugins: { 'import-x': importX },
    rules: {
      'import-x/no-restricted-paths': ['error', {
        zones: [
          { target: './packages/core/src/pipeline/save', from: './packages/core/src/generation',
            message: 'INVARIANT (Pragmatic §5): no LLM call on the save path. Extractive lead + keyphrases only.' },
          { target: './packages/core/src/acquisition', from: './packages/core/src/generation' },
          { target: './packages/core/src/embedding', from: './packages/core/src/generation' },
          { target: './packages/core/src/chunker', from: './packages/core/src/generation' },
          { target: './packages/core/src/importers', from: './packages/core/src/generation' },
          { target: './apps/desktop/src/main/acquisition', from: './apps/desktop/src/main/providers/generation' },
          { target: './apps/desktop/src/main/ipc/save.ts', from: './apps/desktop/src/main/providers/generation' },
        ],
      }],
    },
  },

  // ── C: one net chokepoint ───────────────────────────────────────────────────────────────
  {
    files: ['apps/desktop/src/**/*.ts'],
    ignores: ['apps/desktop/src/main/net/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['undici', 'node:http', 'node:https', 'node:net', 'node:dgram'],
          message: 'All outbound I/O goes through main/net so it lands in egress_log. Import { httpGet, httpPost } from "../net".',
        }],
      }],
    },
  },

  // Tests and scripts may use node freely; CommonJS scripts may require().
  {
    files: ['**/test/**/*.ts', '**/*.test.ts', '**/scripts/**/*.{ts,mjs,cjs}', '**/e2e/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
