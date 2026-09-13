# The Builder — Technical Design, Cairn v1 (P0–P7)

**2026-09-12.** Implements *03-the-pragmatic.md* (settled) with versions from *02-the-expert.md*. Everything here is the *how*; the Planner owns the *when*. Where the Pragmatic left a choice open I mark it **[BUILDER CHOICE]** and give the reason.

**Three structural decisions that shape everything below.**

1. **Hexagonal ports.** `packages/core` has zero `node:` imports because it never *acquires* anything — it takes `DbHandle`, `FetchLike`, `FileStore`, `Clock`, `Random`, `SecretStore` as arguments. better-sqlite3, undici, onnxruntime-node and Electron all live in `apps/desktop/src/main`. This is what makes the lint rule enforceable rather than aspirational, and what keeps the PWA/extension option alive.
2. **One net chokepoint.** `apps/desktop/src/main/net/` is the only module in the repo permitted to import `undici`/`fetch`/`node:https`. Every outbound byte therefore passes `withEgress()`, so `egress_log` completeness is a lint rule, not a discipline.
3. **Undo is a forward op.** Reverting a `run` never deletes history; it appends inverse ops with fresh HLCs. This is the single property that lets the v1 op log become a Loro doc in P9 without a migration of semantics.

---

## 1. Repo layout & tooling

### 1.1 Tree

```
AI-bookmark-manager/                    branch v2-local-first, phases v2/p<N>-<slug>
├─ package.json                         private, npm workspaces root
├─ package-lock.json                    (bun.lock DELETED in the first commit)
├─ tsconfig.base.json                   strict, ES2023, "moduleResolution": "bundler"
├─ tsconfig.json                        project references only, no files
├─ eslint.config.js                     flat config; holds the three firewalls (§1.4)
├─ vitest.workspace.ts
├─ .gitignore  .env.example  .nvmrc(24)  .npmrc(engine-strict=true)
├─ apps/
│  ├─ desktop/
│  │  ├─ package.json                   @cairn/desktop · "main": "out/main/index.js"
│  │  ├─ electron.vite.config.ts
│  │  ├─ electron-builder.yml
│  │  ├─ tsconfig.node.json             main + preload (lib ES2023, types node/electron)
│  │  ├─ tsconfig.web.json              renderer (lib ES2023 + DOM)
│  │  ├─ build/                         icon.ico/.png/.icns · entitlements.mac.plist · installer.nsh
│  │  ├─ resources/
│  │  │  ├─ exclusions.default.json     shipped data file (§4.15)
│  │  │  ├─ stopwords.fr.json  stopwords.en.json
│  │  │  └─ models.manifest.json        {id,url,sha256,bytes,license} per downloadable artefact
│  │  ├─ scripts/
│  │  │  ├─ verify-macsign.cjs          port of artlux scripts/verify-mac-signature.cjs
│  │  │  ├─ verify-resources.cjs        asserts every extraResource exists pre-build
│  │  │  └─ gen-migrations.mjs          *.sql → migrations.generated.ts (§3.8)
│  │  └─ src/
│  │     ├─ shared/protocol.ts          IPC channel consts + req/res types (main+preload+renderer)
│  │     ├─ shared/inference-protocol.ts
│  │     ├─ main/
│  │     │  ├─ index.ts                 lifecycle, windows, fuses, single-instance lock
│  │     │  ├─ db/                      BetterSqliteHandle (DbHandle impl), open(), migrate(), backup()
│  │     │  ├─ ops/                     applyOp host wrapper: tx + HLC mint + actor + run stamping
│  │     │  ├─ ipc/                     one module per channel group, registered from a manifest
│  │     │  ├─ jobs/                    queue runner, throttles (battery/thermal/typing), schedulers
│  │     │  ├─ acquisition/             tier hosts: undiciTier, fetcherWindow, pdfTier, waybackTier
│  │     │  ├─ providers/
│  │     │  │  ├─ embedding/            onnxruntime-node host + tokenizer
│  │     │  │  └─ generation/           ollama · localpack · cloud · extractive   ← FIREWALLED
│  │     │  ├─ inference/               utilityProcess supervisor + wire protocol (§2.4)
│  │     │  ├─ net/                     ONLY place undici/fetch is imported; withEgress()
│  │     │  ├─ crypto/                  safeStorage vault, identity, bundle seal/open
│  │     │  ├─ models/                  download state machine, sha256 verify, cache paths
│  │     │  └─ updater.ts               artlux port (§2.7)
│  │     ├─ preload/index.ts            contextBridge → window.cairn
│  │     └─ renderer/
│  │        ├─ index.html main.tsx App.tsx
│  │        ├─ screens/ state/ hooks/ workers/ i18n/
│  └─ extension/                        v1 PLACEHOLDER: manifest.json + README.md + .gitkeep
├─ packages/
│  ├─ core/                             @cairn/core — zero node: imports
│  └─ ui/                               @cairn/ui — React components, no IPC, no i18n init
├─ legacy/                              the current app, verbatim; DELETED at end of P0
├─ plans/                               SEQUENCING.md · p0..p7.md · rig-tests/
├─ docs/                                architecture.md · egress.md · recovery.md · inference-contract.md
├─ eval/                                urls.fr.json urls.en.json queries.json run.mjs reports/
├─ fixtures/extractors/<domain>/        golden HTML + expected JSON
└─ .fixtures/                           GENERATED, gitignored: library-10k.db, library-100k.db
```

`packages/core/src` internal layout — the directory names are load-bearing, they are what the firewall zones reference:

```
ports/   ids/   db/{migrations,schema.ts,queries}   ops/   url/   importers/   exporters/
acquisition/{router.ts,tiers,extract.ts,postprocess.ts,robots.ts,limiter.ts}
chunker/   embedding/   generation/   search/   clustering/   tags/   trees/   map/
ask/   jobs/   bundle/   identity/   egress/   exclusions/
pipeline/{save,summarise,reorganise}
```

### 1.2 Root `package.json`

```jsonc
{
  "name": "cairn-workspace",
  "private": true,
  "type": "module",
  "packageManager": "npm@11.12.1",
  "engines": { "node": ">=24.0.0 <25", "npm": ">=11" },
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev":          "npm -w @cairn/desktop run dev",
    "build":        "npm run typecheck && npm -w @cairn/core run build && npm -w @cairn/ui run build && npm -w @cairn/desktop run build",
    "typecheck":    "tsc -b --pretty false",
    "lint":         "eslint . --max-warnings 0",
    "test":         "vitest run --project core --project ui",
    "test:scale":   "cross-env CAIRN_FIXTURE=.fixtures/library-100k.db vitest run --project scale --testTimeout=900000",
    "test:e2e":     "playwright test -c apps/desktop/playwright.config.ts",
    "eval":         "node eval/run.mjs",
    "fixture:gen":  "node --experimental-strip-types packages/core/scripts/genFixture.ts",
    "migrations":   "node apps/desktop/scripts/gen-migrations.mjs",
    "package":      "npm run lint && npm run typecheck && npm run migrations && npm -w @cairn/desktop run rebuild && npm run build && node apps/desktop/scripts/verify-resources.cjs && electron-builder -c apps/desktop/electron-builder.yml --publish never && npm run verify:macsign",
    "verify:macsign": "node apps/desktop/scripts/verify-macsign.cjs"
  }
}
```

`apps/desktop` adds `"rebuild": "electron-rebuild -f -w better-sqlite3"` and `"dev": "electron-vite dev"`.

### 1.3 TypeScript project references

`tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `target ES2023`, `module ESNext`, `moduleResolution bundler`, `composite: true`, `declaration`, `declarationMap`.

| Project | `lib` | `types` | references |
|---|---|---|---|
| `packages/core` | `["ES2023"]` — **no `DOM`, no `@types/node`** | `[]` | — |
| `packages/ui` | `["ES2023","DOM"]` | `[]` | core |
| `apps/desktop/tsconfig.node.json` | `["ES2023"]` | `["node","electron"]` | core |
| `apps/desktop/tsconfig.web.json` | `["ES2023","DOM","DOM.Iterable"]` | `["vite/client"]` | core, ui |

Omitting `@types/node` from `packages/core` is the *compiler-level* half of the no-`node:` rule: `import fs from 'node:fs'` fails to typecheck before ESLint runs.

### 1.4 The three firewalls (`eslint.config.js`)

```js
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';

const NODE_BUILTINS = ['fs','path','os','crypto','child_process','worker_threads','http','https',
  'net','tls','zlib','stream','buffer','util','events','url','process','dns','v8','perf_hooks'];

export default tseslint.config(
  // ── A: packages/core is runtime-agnostic ────────────────────────────────────
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['node:*', ...NODE_BUILTINS],
          message: 'packages/core must run in a browser/worker. Take a port (DbHandle, FetchLike, FileStore, Clock, Random, SecretStore) as an argument instead — see packages/core/src/ports/.' },
        { group: ['electron','electron/*','better-sqlite3','sqlite-vec','onnxruntime-node',
                  'node-llama-cpp','undici','@number0/iroh','electron-updater'],
          message: 'Host-only dependency. It belongs in apps/desktop/src/main.' },
        { group: ['@cairn/ui','react','react-dom'], message: 'core is headless.' },
      ]}],
    },
  },

  // ── B: THE INVARIANT — the save path cannot reach generation ────────────────
  {
    plugins: { 'import-x': importX },
    rules: {
      'import-x/no-restricted-paths': ['error', { zones: [
        { target: './packages/core/src/pipeline/save',   from: './packages/core/src/generation',
          message: 'INVARIANT (Pragmatic §5): no LLM call on the save path. Extractive lead + keyphrases only.' },
        { target: './packages/core/src/acquisition',     from: './packages/core/src/generation' },
        { target: './packages/core/src/embedding',       from: './packages/core/src/generation' },
        { target: './packages/core/src/chunker',         from: './packages/core/src/generation' },
        { target: './packages/core/src/importers',       from: './packages/core/src/generation' },
        { target: './apps/desktop/src/main/acquisition', from: './apps/desktop/src/main/providers/generation' },
        { target: './apps/desktop/src/main/ipc/save.ts', from: './apps/desktop/src/main/providers/generation' },
      ]}],
    },
  },

  // ── C: one net chokepoint ──────────────────────────────────────────────────
  {
    files: ['apps/desktop/src/**/*.ts'],
    ignores: ['apps/desktop/src/main/net/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [
      { group: ['undici','node:http','node:https','node:net','node:dgram'],
        message: 'All outbound I/O goes through main/net so it lands in egress_log. Import { httpGet, httpPost } from "../net".' }]}]},
  },
);
```

Firewall B is **also a test**, because a lint rule can be disabled in a commit nobody reads:

```ts
// packages/core/test/arch.invariants.test.ts
it('the save path cannot reach the generation provider', async () => {
  const reached = await reachableModules('src/pipeline/save/savePath.ts'); // es-module-lexer BFS over the graph
  expect([...reached].filter(m => m.includes('/generation/'))).toEqual([]);
});
it('no module in core imports a node builtin', async () => { /* same walk, whole package */ });
```

### 1.5 `.gitignore` additions (first commit)

```gitignore
.env
.env.*
!.env.example
*.db
*.db-wal
*.db-shm
*.sqlite
.fixtures/
snapshots/
release/
out/
models/
.cache/
eval/reports/
playwright-report/
test-results/
```

### 1.6 First-commit checklist (P0, before any feature code)

1. `git switch -c v2-local-first`.
2. `git rm --cached .env` if tracked; add the `.gitignore` block; commit.
3. **Rotate the Gemini API key in Google AI Studio.** `vite.config.ts` `define`d it into the client bundle, so it is in every built artefact and possibly in git history. Rotation is the fix; history rewriting is optional and secondary. Revoke the old key, do not merely replace it.
4. `git rm bun.lock`; `rm -rf node_modules`; `npm install` under Node 24 / npm 11; commit `package-lock.json`.
5. `git mv` the existing app into `legacy/` in **one commit** so the port diff stays readable. Delete the 14 `test-*` files, the duplicate root `Header.tsx`, `components/ApiKeySetup.tsx`, `.idx/`.
6. Scaffold `apps/desktop`, `packages/core`, `packages/ui`, `apps/extension/.gitkeep`, `plans/`, `docs/`, `eval/`, `fixtures/`.
7. Land `eslint.config.js` with all three firewalls **red-green tested**: add a throwaway `import fs from 'node:fs'` in core, confirm lint fails, revert.
8. `.env.example` with `GEMINI_API_KEY=` / `ANTHROPIC_API_KEY=` commented and a line saying runtime keys come from `safeStorage`; `.env` is dev-only.
9. `plans/SEQUENCING.md` seeded from artlux's format: phases, one branch per phase, ASCII dependency graph, merge only after a signed-off rig test.
10. CI stub: `lint` + `typecheck` + `test` on push; matrix added in P7.
11. Copy `01/02/03` research reports into `plans/research/` so the decision record ships with the repo.

---

## 2. Electron process model

Electron 44.x. Four process kinds: **main** (DB owner, job queue, acquisition, providers, crypto), **renderer** (one visible window, React 19), **`utilityProcess` × 2** (inference, layout), **hidden `BrowserWindow`** (tier-4 fetcher, offscreen, its own session).

```
                     ┌───────────────────────────────────────────────┐
  renderer ──IPC──►  │ main                                          │
  (React 19)  ◄──    │  DbHandle(better-sqlite3, WAL) ─ applyOp()    │
                     │  JobQueue ── throttles                        │
                     │  net/ (undici + withEgress)                   │
                     │  crypto/ (safeStorage, Ed25519, XChaCha)      │
                     └───┬───────────────┬──────────────────┬────────┘
                utilityProcess      utilityProcess     hidden BrowserWindow
                 "inference"          "layout"          "fetcher"
              node-llama-cpp /      umap-js on         offscreen, persist:fetcher
              onnxruntime-node      landmarks          images off, JS on
```

### 2.1 Security flags

```ts
new BrowserWindow({
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true, nodeIntegration: false, sandbox: true,
    webviewTag: false, nodeIntegrationInSubFrames: false, spellcheck: false,
  },
});
app.enableSandbox();                                         // before app.whenReady()
contents.setWindowOpenHandler(() => ({ action: 'deny' }));   // external links go through a host-checked shell.openExternal
session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
```

CSP injected via `onHeadersReceived`: `default-src 'self'; img-src 'self' data: https:; connect-src 'self'; script-src 'self'`. The renderer never talks to the network; thumbnails are the single exception and are proxied through a `cairn-thumb://` custom protocol in P3 so even that can be turned off. Fuses: `{ runAsNode: false, enableNodeCliInspectArguments: false, onlyLoadAppFromAsar: true, resetAdHocDarwinSignature: true }`.

### 2.2 Preload surface

One frozen object, no `ipcRenderer` leak, every method typed from `src/shared/protocol.ts`. Event subscriptions return an unsubscribe function (artlux pattern).

```ts
contextBridge.exposeInMainWorld('cairn', Object.freeze({
  app: { info: () => ipcRenderer.invoke(IPC.APP_INFO) },
  library: { query: (q: LibraryQuery) => ipcRenderer.invoke(IPC.LIB_QUERY, q), /* … */ },
  jobs: { onState: (cb) => { const l = (_e, s) => cb(s); ipcRenderer.on(IPC.JOBS_STATE, l);
                             return () => ipcRenderer.removeListener(IPC.JOBS_STATE, l); } },
  /* … */
} satisfies CairnApi));
```

| # | Channel | Kind | Request | Response / event payload |
|---|---|---|---|---|
| 1 | `app:info` | invoke | — | `{version, platform, arch, userDataPath, dbPath, locale}` |
| 2 | `library:query` | invoke | `{collectionId?, text?, tagIds?, platform?, status?, dateFrom?, dateTo?, themeId?, sort, cursor?, limit}` | `Page<BookmarkRow>` |
| 3 | `library:get` | invoke | `{id}` | `BookmarkDetail` = bookmark + current `content_version` + tags + theme + chunk count |
| 4 | `library:saveUrls` | invoke | `{collectionId, items:{url,addDate?,title?}[], source:'paste'\|'import'\|'extension'}` | `{accepted:SavedRef[], duplicates:{url,existingId}[], rejected:{url,reason}[]}` |
| 5 | `library:applyOps` | invoke | `{ops: OpInput[]}` | `{opIds:string[], hlc:string}` |
| 6 | `library:bulkEdit` | invoke | `{ids, addTags?, removeTags?, setCollection?, setStarred?, softDelete?}` | `{runId, changed}` |
| 7 | `search:query` | invoke | `{q, scope:{kind:'global'\|'collection'\|'selection', ids?}, limit, mode:'hybrid'\|'fts'\|'vector'}` | `{queryId, hits:SearchHit[], tookMs, counts}` |
| 8 | `search:feedback` | send | `{queryId, bookmarkId, event:'click'\|'dwell'\|'dismiss', ms?}` | — |
| 9 | `map:points` | invoke | `{collectionId?, runId?}` | `{ids:Uint8Array(n*16), xy:Float32Array(n*2), theme:Uint16Array(n), ts:Float64Array(n)}` (transferables) |
| 10 | `map:selectionStats` | invoke | `{ids:string[]}` \| `{lasso:Polygon}` | `{count, terms[], domains[], hist[], tags[], confidence[]}` |
| 11 | `tree:get` | invoke | `{collectionId}` | `TreeNodeDto[]` flat (`id,parentId,fracIndex,kind,refId,label,pinned`) |
| 12 | `tree:query` | invoke | `{q, scope, maxDepth}` | `TreeNodeDto[]` ephemeral, nothing persisted |
| 13 | `tree:pin` | invoke | `{collectionId, parentId, ephemeral:TreeNodeDto}` | `{nodeId}` |
| 14 | `tree:move` | invoke | `{nodeId, newParentId, beforeId?, afterId?}` | `{fracIndex}` |
| 15 | `runs:list` | invoke | `{status?, kind?, limit}` | `RunSummary[]` |
| 16 | `runs:diff` | invoke | `{runId, cursor?, limit, filter?}` | `Page<RunItemDto>` |
| 17 | `runs:decide` | invoke | `{runId, decisions[]}` \| `{runId, all:'accept'\|'reject'}` | `{applied, rejected, remaining}` |
| 18 | `runs:revert` | invoke | `{runId}` | `{revertedOps, newRunId}` |
| 19 | `runs:start` | invoke | `{kind:'reorganise'\|'tagConsolidation'\|'summarise'\|'relabel', params, provider}` | `{runId, estimate:{llmCalls, etaSeconds, cloudCostEur?}}` |
| 20 | `jobs:control` | send | `{action:'pause'\|'resume'\|'cancel'\|'priority', jobId?, queue?}` | — |
| 21 | `jobs:state` | **event** | — | `{running:JobDto[], pending, byKind, paused, throttle:{battery,thermal,typing}}` at ≤2 Hz |
| 22 | `ask:run` | invoke | `{scope, question, maxChunks:500, provider?}` | `{askId}` |
| 23 | `ask:event` | **event** | — | `{askId, kind:'passages'\|'token'\|'done'\|'error', passages?, delta?, citations?}` |
| 24 | `import:preview` | invoke | `{kind:ImporterId, path\|bytes, mapping?}` | `{previewId, total, new, duplicates, malformed, sample, detectedMapping}` |
| 25 | `import:commit` | invoke | `{previewId, collectionId, enqueueFetch}` | `{runId, inserted}` |
| 26 | `export:run` | invoke | `{targets:('json'\|'netscape'\|'markdown'\|'db'\|'snapshots')[], dir}` | `{files, bytes}` |
| 27 | `bundle:export` | invoke | `{collectionId, memberPubkeys, includeSnapshots, path}` | `{path, bytes, records, warning?}` |
| 28 | `bundle:import` | invoke | `{path}` | `{collectionId, name, records, newItems, updatedItems, conflicts, signer}` |
| 29 | `identity:get` | invoke | — | `{pubkey, fingerprint, createdAt, hasBackup}` |
| 30 | `identity:backup` | invoke | `{confirm:true}` | `{mnemonic:string[24]}` — one-shot, never written to disk in cleartext |
| 31 | `members:list\|add\|remove` | invoke | `{collectionId, …}` | `Member[]` / `{epoch}` |
| 32 | `settings:get` / `settings:set` | invoke | `{keys?}` / `{patch}` | `Settings` |
| 33 | `secrets:set` / `secrets:status` | invoke | `{provider, key}` / — | `{ok}` / `{provider, present, lastUsedAt}` — **write-only across IPC** |
| 34 | `providers:probe` | invoke | `{force?}` | `{embedding:ProviderState, generation:ProviderState[], hw:{vramMb, ramMb, gpu, battery}}` |
| 35 | `models:ensure` | invoke | `{modelId}` | `{state:'present'\|'downloading'\|'failed', bytes, sha256}` |
| 36 | `models:progress` | **event** | — | `{modelId, received, total, phase:'download'\|'verify'\|'extract'\|'done'\|'error'}` |
| 37 | `egress:list` | invoke | `{since?, host?, purpose?, cursor?}` | `Page<EgressRow>` |
| 38 | `exclusions:get` / `exclusions:set` | invoke | — / `{rules}` | `{defaults, user, allow}` |
| 39 | `update:check\|download\|install` | send | — | — |
| 40 | `update:event` | **event** | — | `{status:'checking'\|'available'\|'not-available'\|'progress'\|'downloaded'\|'manual'\|'error', …}` |

Forty channels in ten namespaces. Channel 33 is deliberately one-way: a compromised renderer can *set* a key but never read one back.

### 2.3 Renderer state: **[BUILDER CHOICE] Zustand**

Three reasons context loses. (a) The map hovers and brushes at 60 fps while the library table virtualises 100k rows; React context re-renders every consumer on any value change, so a hover would re-render the table. Zustand's selector subscriptions confine it. (b) IPC events arrive *outside* React — `cairn.jobs.onState(cb)` in `main.tsx` calls `useJobStore.getState().apply(...)` with no provider in scope. (c) Slices are plain modules, so store logic is unit-testable with no renderer. Cost: one ~1.2 kB dependency and the rule that derived data is computed in selectors, never stored.

### 2.4 `utilityProcess` "inference"

`utilityProcess.fork(join(__dirname,'inference.js'), [], { serviceName:'cairn-inference', stdio:'pipe' })`. Node context, no Electron APIs, `MessagePort` transport.

```ts
// apps/desktop/src/shared/inference-protocol.ts
export type InferenceReq =
  | { id: string; kind: 'probe' }
  | { id: string; kind: 'load';  backend:'llamacpp'|'onnx'; modelPath: string;
      gpuLayers: number; contextSize: number }
  | { id: string; kind: 'generate'; prompt: string; system?: string; jsonSchema?: unknown;
      maxTokens: number; temperature: number; stop?: string[]; timeoutMs: number }
  | { id: string; kind: 'embed'; texts: string[]; dim: 768; normalize: true }
  | { id: string; kind: 'cancel'; target: string }
  | { id: string; kind: 'unload' };

export type InferenceRes =
  | { id: string; kind: 'probe';   backends: string[]; vramMb: number | null; buildInfo: string }
  | { id: string; kind: 'loaded';  modelId: string; contextSize: number; loadMs: number }
  | { id: string; kind: 'token';   delta: string }
  | { id: string; kind: 'done';    text: string; tokensIn: number; tokensOut: number; ms: number }
  | { id: string; kind: 'vectors'; buf: ArrayBuffer /* n×dim f32, transferred */; n: number; dim: number }
  | { id: string; kind: 'error';   code:'oom'|'timeout'|'schema'|'load'|'cancelled'|'internal'; message: string };
```

**Crash / restart policy.** A supervisor owns the handle. On `exit`, every in-flight id resolves to `{kind:'error', code:'oom'}` and the process restarts after `min(1000·2ⁿ, 15000)` ms. Three exits inside ten minutes ⇒ the backend is marked `degraded`, the provider chain re-probes and falls one rung down (local pack → Ollama → cloud → extractive), and the renderer gets a toast naming the backend. Jobs carry `attempts`; at `attempts ≥ 3` the job becomes `status='failed'` with `last_error` and surfaces in the Review queue — never silently dropped. Loading is idempotent on `profileKey = blake3(modelPath, gpuLayers, contextSize)`: same key is a no-op, different key is an explicit unload+load the UI warns about first (the WhisperLive `plan()`/`ensure()` split, with `plan()` pure and unit-tested).

**VRAM probe.** `app.getGPUInfo('complete')` for vendor/renderer strings; on win32 additionally `nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits` with a 2 s timeout and swallowed failure; on darwin `os.totalmem()` (unified memory). Persisted as `settings['hw.vramMb']`, user-overridable, re-probed only on `force`. Default model table: `vram ≥ 6000 → qwen3.5-4b-q4km @ 4096`; `≥ 3500 → qwen3.5-4b-q4km @ 2048`; else `gemma4-e2b-q4 @ 4096`; on battery always E2B. **The P4 rig tests overwrite this table with measured numbers** (Pragmatic §17).

**The embedding rule, enforced in the supervisor.** While a `llamacpp` model is resident, `kind:'embed'` is refused with `code:'oom'` and the caller falls back to the main-process onnxruntime-node CPU session. 4 GB will not hold both.

### 2.5 `utilityProcess` "layout"

Opens a **second, read-only** DB connection (`{readonly:true}` — WAL permits it), streams 256-d vectors, runs `umap-js` over the landmark sample, computes inverse-distance placement for the remainder, and posts `{ids:Uint8Array, xy:Float32Array}` batches of 10k back to main, which writes `bookmarks.map_x/map_y` one transaction per batch. Out-of-process rather than a renderer Worker because 100k × 256 × 4 B = 102 MB does not want to cross the renderer IPC boundary — a read-only DB handle does.

### 2.6 Hidden `BrowserWindow` fetcher (tier 4)

```ts
const ses = session.fromPartition('persist:fetcher');   // isolated cookie jar, never the app session
ses.setUserAgent(`Mozilla/5.0 (${uaPlatform}) AppleWebKit/537.36 (KHTML, like Gecko) ` +
                 `Chrome/${process.versions.chrome.split('.')[0]}.0.0.0 Safari/537.36`);
ses.setPermissionRequestHandler((_w, _p, cb) => cb(false));
ses.webRequest.onBeforeSendHeaders((d, cb) =>
  cb({ requestHeaders: { ...d.requestHeaders, 'Accept-Language': 'fr,en;q=0.9' } }));
ses.webRequest.onBeforeRequest((d, cb) => {
  if (exclusions.matches(d.url)) return cb({ cancel: true });           // an excluded host is never contacted
  if (['image','media','font','cspReport'].includes(d.resourceType)) return cb({ cancel: true });
  inflight.add(d.id); cb({});
});

const win = new BrowserWindow({
  show: false, width: 1280, height: 2000,
  webPreferences: { session: ses, offscreen: true, sandbox: true, contextIsolation: true,
                    nodeIntegration: false, javascript: true, images: false,
                    webSecurity: true, backgroundThrottling: false },
});
```

*Network idle*: a counter incremented in `onBeforeRequest`, decremented in `onCompleted`/`onErrorOccurred`; resolve when it has held 0 for 500 ms, soft cap 15 s, absolute `loadURL` timeout 25 s then `webContents.stop()`.
*Extraction*: `webContents.executeJavaScriptInIsolatedWorld(1337, [{ code: 'document.documentElement.outerHTML' }])` — an isolated world, so a hostile page cannot have redefined what it hands back. The HTML string then goes through the **same tier-2 extractor** in core (defuddle → readability), which is why golden fixtures cover both tiers at once.
*Hygiene*: one window, reused; `loadURL('about:blank')` between jobs; destroyed and recreated every 25 pages or 5 minutes, whichever comes first, to bound leaks. Never more than one fetcher window.
*Queue*: global concurrency 4, **per registrable-domain concurrency 1**, token bucket 1 req / 2000 ms ± 400 ms jitter (`acquisition/limiter.ts`, pure, injected clock). `robots.txt` fetched once per host through the same limiter and cached 24 h; a user override writes an `egress_log` row with `purpose='robots-override'`.

### 2.7 Updater (artlux port)

`autoDownload = false`, `autoInstallOnAppQuit = false`, and `autoUpdater` resolved **inside** `setupUpdater()` — artlux's lazy-getter trap: touching `electronUpdater.autoUpdater` at module scope calls `app.getVersion()` and crashes a re-exec'd process. Events forwarded on `update:event`; renderer prompts on `available` → `downloadUpdate()`, prompts again on `downloaded` → `quitAndInstall()`. Background check 4 s after launch, failures swallowed. One change from artlux: since Cairn will carry a Developer ID signature, macOS is *supported* rather than shunted to `status:'manual'` — but only when `app.isPackaged` and the signature is Developer ID; ad-hoc builds still emit `manual` with the Releases URL.
---

## 3. Database schema

better-sqlite3 13, WAL. Connection pragmas (per connection, set in `db/open.ts`, **not** in a migration):

```sql
PRAGMA journal_mode = WAL;          -- persistent, set once
PRAGMA synchronous  = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA mmap_size    = 268435456;    -- 256 MB
PRAGMA cache_size   = -65536;       -- 64 MB
PRAGMA temp_store   = MEMORY;
PRAGMA analysis_limit = 400;        -- + PRAGMA optimize on close
```

**Two conventions that hold everywhere.** (a) Every id is a **UUIDv7** stored as a 36-char lowercase TEXT — time-ordered, so a `PRIMARY KEY` on it is also a creation-order index, and no autoincrement PK is ever exposed. (b) No table is `WITHOUT ROWID`: FTS5 external-content tables need an integer `rowid` on the content table, and sqlite-vec's `vec0` addresses rows by `rowid`. Those rowids live only inside disposable indexes — never in an op, never in a bundle, never in an export.

### 3.1 DDL — `0001_init.sql`

```sql
--------------------------------------------------------------------- collections
CREATE TABLE collections (
  id                TEXT PRIMARY KEY NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  visibility        TEXT NOT NULL DEFAULT 'private'
                      CHECK (visibility IN ('private','shared','published')),
  epoch             INTEGER NOT NULL DEFAULT 1,
  key_ref           TEXT,                    -- relative path under userData/keys/, NULL while private
  snapshots_enabled INTEGER NOT NULL DEFAULT 0,
  owner_pubkey      TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT
);
-- the unshared library is a real collection with a fixed id, so every row has a collection_id
INSERT INTO collections (id,name,visibility,owner_pubkey,created_at,updated_at)
VALUES ('00000000-0000-7000-8000-000000000001','Ma bibliothèque','private','',
        strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

--------------------------------------------------------------------- bookmarks
CREATE TABLE bookmarks (
  id                 TEXT PRIMARY KEY NOT NULL,
  collection_id      TEXT NOT NULL REFERENCES collections(id),
  url                TEXT NOT NULL,
  url_norm           TEXT NOT NULL,          -- UrlNormalizer output; the dedupe key
  url_hash           TEXT NOT NULL,          -- blake3(url_norm) hex[0:32]
  title              TEXT NOT NULL DEFAULT '',
  summary            TEXT NOT NULL DEFAULT '',
  summary_kind       TEXT NOT NULL DEFAULT 'none'
                       CHECK (summary_kind IN ('none','extractive','llm','imported')),
  summary_model_id   TEXT,
  author             TEXT,
  platform           TEXT,                   -- youtube|threads|twitter|github|article|website|pdf
  lang               TEXT,                   -- ISO 639-1, from franc
  thumbnail_url      TEXT,
  note               TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new','fetching','ready','partial','failed')),
  starred            INTEGER NOT NULL DEFAULT 0,
  open_count         INTEGER NOT NULL DEFAULT 0,
  last_opened_at     TEXT,
  confidence         INTEGER,                -- 0..100, mirrors current content_version
  confidence_reason  TEXT,
  acquisition_method TEXT,                   -- mirrors current content_version.method
  current_version_id TEXT,
  map_x              REAL,
  map_y              REAL,
  map_run_id         TEXT,
  created_at         TEXT NOT NULL,          -- user-facing "added"; ADD_DATE on import
  updated_at         TEXT NOT NULL,
  deleted_at         TEXT
);
CREATE UNIQUE INDEX ix_bm_urlhash    ON bookmarks(collection_id, url_hash) WHERE deleted_at IS NULL;
CREATE INDEX        ix_bm_coll_date  ON bookmarks(collection_id, created_at DESC);
CREATE INDEX        ix_bm_status     ON bookmarks(status) WHERE status <> 'ready';
CREATE INDEX        ix_bm_map        ON bookmarks(map_run_id) WHERE map_x IS NOT NULL;

--------------------------------------------------------------- content_versions
CREATE TABLE content_versions (
  id                TEXT PRIMARY KEY NOT NULL,
  bookmark_id       TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  fetched_at        TEXT NOT NULL,
  method            TEXT NOT NULL,   -- api:github | shim:youtube | http:defuddle | render:bw |
                                     -- pdf:unpdf | archive:wayback | cloud:gemini | og-only | failed
  tier              INTEGER NOT NULL,
  http_status       INTEGER,
  final_url         TEXT,
  lang              TEXT,
  title             TEXT,
  text              TEXT,
  text_hash         TEXT,            -- blake3 hex of text
  html_hash         TEXT,
  snapshot_hash     TEXT,            -- blake3 of the .html.zst file; NULL unless snapshots enabled
  byte_len          INTEGER,
  confidence        INTEGER NOT NULL,
  confidence_reason TEXT NOT NULL,
  extractor_version TEXT NOT NULL,   -- lets a better extractor re-run over stored html/snapshot
  error             TEXT
);
CREATE INDEX ix_cv_bm ON content_versions(bookmark_id, fetched_at DESC);

--------------------------------------------------------------------- chunks
CREATE TABLE chunks (
  id            TEXT PRIMARY KEY NOT NULL,
  bookmark_id   TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  version_id    TEXT NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
  ord           INTEGER NOT NULL,
  heading_path  TEXT NOT NULL DEFAULT '',    -- "H1 › H2 › H3"
  char_start    INTEGER NOT NULL,
  char_end      INTEGER NOT NULL,
  token_est     INTEGER NOT NULL,
  page          INTEGER,                     -- PDFs only
  text          TEXT NOT NULL
);
CREATE UNIQUE INDEX ix_chunk_ord ON chunks(version_id, ord);
CREATE INDEX        ix_chunk_bm  ON chunks(bookmark_id);

--------------------------------------------------------------------- embeddings
-- One row per (owner, model). vec BLOB = dim × float32 little-endian, L2-normalised.
CREATE TABLE embeddings (
  owner_type  TEXT NOT NULL CHECK (owner_type IN ('bookmark','chunk','tag','theme','query')),
  owner_id    TEXT NOT NULL,
  model_id    TEXT NOT NULL,                 -- 'embeddinggemma-300m-q8'
  dim         INTEGER NOT NULL,              -- 768
  vec         BLOB NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (owner_type, owner_id, model_id)
);
CREATE INDEX ix_emb_model ON embeddings(model_id, owner_type);

--------------------------------------------------------------------- tags
CREATE TABLE tags (
  id            TEXT PRIMARY KEY NOT NULL,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  label         TEXT NOT NULL,               -- display form
  label_norm    TEXT NOT NULL,               -- NFKC + casefold + diacritics stripped + singularised
  label_fr      TEXT,
  label_en      TEXT,
  color         TEXT,
  usage_count   INTEGER NOT NULL DEFAULT 0,  -- denormalised, rebuilt by a job
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE UNIQUE INDEX ix_tag_norm ON tags(collection_id, label_norm) WHERE deleted_at IS NULL;

CREATE TABLE tag_aliases (
  id          TEXT PRIMARY KEY NOT NULL,
  tag_id      TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  alias       TEXT NOT NULL,
  alias_norm  TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('user','import','ai')),
  run_id      TEXT,
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX ix_alias_norm ON tag_aliases(alias_norm, tag_id);

CREATE TABLE bookmark_tags (
  bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  tag_id      TEXT NOT NULL REFERENCES tags(id)      ON DELETE CASCADE,
  source      TEXT NOT NULL CHECK (source IN ('user','import','ai')),
  accepted    INTEGER NOT NULL DEFAULT 1,   -- AI tags land accepted=0 and render in a distinct style
  score       REAL,
  run_id      TEXT,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (bookmark_id, tag_id)
);
CREATE INDEX ix_bt_tag ON bookmark_tags(tag_id) WHERE accepted = 1;

--------------------------------------------------------------------- themes
CREATE TABLE themes (
  id           TEXT PRIMARY KEY NOT NULL,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  run_id       TEXT NOT NULL,
  resolution   REAL NOT NULL,                -- 0.4 | 1.0 | 2.0
  parent_id    TEXT REFERENCES themes(id),
  label_fr     TEXT NOT NULL,
  label_en     TEXT NOT NULL,
  description_fr TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  emoji        TEXT,
  terms        TEXT NOT NULL DEFAULT '[]',   -- JSON: top c-TF-IDF terms with scores
  centroid     BLOB,                         -- 768 f32, label+description embedding
  size         INTEGER NOT NULL DEFAULT 0,
  color_idx    INTEGER,                      -- 0..9, or NULL → "autre"
  label_source TEXT NOT NULL DEFAULT 'llm' CHECK (label_source IN ('llm','ctfidf','user')),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE INDEX ix_theme_run ON themes(collection_id, run_id, resolution);

CREATE TABLE theme_assignments (
  bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  theme_id    TEXT NOT NULL REFERENCES themes(id)    ON DELETE CASCADE,
  resolution  REAL NOT NULL,
  score       REAL NOT NULL,                 -- cosine to centroid
  margin      REAL NOT NULL,                 -- score(top1) − score(top2)
  source      TEXT NOT NULL CHECK (source IN ('centroid','llm','user')),
  run_id      TEXT NOT NULL,
  PRIMARY KEY (bookmark_id, resolution)
);
CREATE INDEX ix_ta_theme ON theme_assignments(theme_id);

--------------------------------------------------------------------- tree_nodes
CREATE TABLE tree_nodes (
  id            TEXT PRIMARY KEY NOT NULL,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  parent_id     TEXT REFERENCES tree_nodes(id) ON DELETE CASCADE,
  frac_index    TEXT NOT NULL,               -- base-62 fractional index, §3.6
  kind          TEXT NOT NULL CHECK (kind IN ('theme','query','pin','folder','bookmark')),
  ref_id        TEXT,                        -- theme id, bookmark id, or NULL for folder
  label_fr      TEXT NOT NULL DEFAULT '',
  label_en      TEXT NOT NULL DEFAULT '',
  emoji         TEXT,
  query         TEXT,                        -- kind='query'|'pin': the frozen query text
  pinned        INTEGER NOT NULL DEFAULT 0,
  user_edited   INTEGER NOT NULL DEFAULT 0,  -- survives regeneration untouched
  depth         INTEGER NOT NULL DEFAULT 0 CHECK (depth <= 4),
  run_id        TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX ix_tn_parent ON tree_nodes(collection_id, parent_id, frac_index);
CREATE INDEX ix_tn_ref    ON tree_nodes(ref_id);

--------------------------------------------------------------------- members
CREATE TABLE members (
  id            TEXT PRIMARY KEY NOT NULL,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  pubkey        TEXT NOT NULL,               -- base58 Ed25519
  x25519_pub    TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL CHECK (role IN ('owner','writer','reader')),
  epoch_granted INTEGER NOT NULL,
  added_at      TEXT NOT NULL,
  removed_at    TEXT
);
CREATE UNIQUE INDEX ix_member ON members(collection_id, pubkey);

--------------------------------------------------------------- feedback_events
CREATE TABLE feedback_events (
  id          TEXT PRIMARY KEY NOT NULL,
  at          TEXT NOT NULL,
  query_id    TEXT,
  query_text  TEXT,
  bookmark_id TEXT,
  event       TEXT NOT NULL CHECK (event IN ('shown','click','dwell','dismiss','open','accept','reject')),
  rank        INTEGER,
  dwell_ms    INTEGER,
  context     TEXT            -- JSON: {scope, themeId, runId}
);
CREATE INDEX ix_fb_bm ON feedback_events(bookmark_id, at DESC);
CREATE INDEX ix_fb_at ON feedback_events(at DESC);

-- Nightly rollup so query time is a hash lookup, not an aggregation.
CREATE TABLE search_affinity (
  kind       TEXT NOT NULL CHECK (kind IN ('tag','domain','theme')),
  key        TEXT NOT NULL,
  weight     REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, key)
);

--------------------------------------------------------------------- jobs
CREATE TABLE jobs (
  id            TEXT PRIMARY KEY NOT NULL,
  kind          TEXT NOT NULL,      -- fetch | embed | chunk | summarise | knn | louvain | label |
                                    -- assign | consolidate | layout | export | import | bundle
  payload       TEXT NOT NULL,      -- JSON
  priority      INTEGER NOT NULL DEFAULT 2,  -- 0 interactive … 4 bulk backfill
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','done','failed','cancelled','blocked')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 3,
  not_before    TEXT,
  lease_until   TEXT,
  run_id        TEXT,
  dedupe_key    TEXT,
  last_error    TEXT,
  created_at    TEXT NOT NULL,
  started_at    TEXT,
  finished_at   TEXT
);
CREATE INDEX        ix_job_ready  ON jobs(status, priority, not_before) WHERE status = 'pending';
CREATE UNIQUE INDEX ix_job_dedupe ON jobs(dedupe_key) WHERE status IN ('pending','running');

--------------------------------------------------------------------- runs
CREATE TABLE runs (
  id            TEXT PRIMARY KEY NOT NULL,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  kind          TEXT NOT NULL,      -- reorganise | tagConsolidation | summarise | relabel |
                                    -- import | bulkEdit | bundleImport | revert
  status        TEXT NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned','running','proposed','partial','accepted',
                                    'rejected','reverted','expired','failed')),
  params        TEXT NOT NULL DEFAULT '{}',
  stats         TEXT NOT NULL DEFAULT '{}',  -- {llmCalls, tokensIn, tokensOut, itemsProposed, …}
  provider      TEXT,
  model_id      TEXT,
  cost_eur      REAL,
  reverts_run_id TEXT REFERENCES runs(id),
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  expires_at    TEXT NOT NULL       -- started_at + 30 days; the undo window
);
CREATE INDEX ix_run_status ON runs(status, started_at DESC);

-- The diff. One row per PROPOSED change. Nothing here is applied until decision='accept'.
CREATE TABLE run_items (
  id          TEXT PRIMARY KEY NOT NULL,
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  group_key   TEXT,                 -- clusters the UI into cards ("merge 4 tags into 'machine learning'")
  entity      TEXT NOT NULL,        -- table name
  entity_id   TEXT NOT NULL,
  field       TEXT,                 -- NULL for create/delete/move
  op          TEXT NOT NULL CHECK (op IN ('create','set','delete','move','link','unlink')),
  before      TEXT,                 -- JSON, NULL for create
  after       TEXT,                 -- JSON, NULL for delete
  confidence  REAL,
  reason_fr   TEXT, reason_en TEXT,
  decision    TEXT NOT NULL DEFAULT 'pending'
                CHECK (decision IN ('pending','accept','reject')),
  decided_at  TEXT,
  op_id       TEXT                  -- set when applied → points at the ops row
);
CREATE INDEX ix_ri_run ON run_items(run_id, decision, group_key);

--------------------------------------------------------------------- ops
-- Append-only. The ONLY table feature code may not INSERT into directly: applyOp() owns it.
CREATE TABLE ops (
  id            TEXT PRIMARY KEY NOT NULL,   -- UUIDv7
  collection_id TEXT NOT NULL,
  entity        TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  field         TEXT,
  op            TEXT NOT NULL CHECK (op IN ('create','set','delete','move','link','unlink')),
  value         TEXT,                        -- JSON, the new value
  inverse       TEXT,                        -- JSON, the prior value — undo material
  hlc           TEXT NOT NULL,               -- §3.5, lexicographically sortable
  actor_pubkey  TEXT NOT NULL,
  origin        TEXT NOT NULL DEFAULT 'local', -- local | bundle:<blake3> | peer:<pubkey>
  run_id        TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX        ix_ops_entity ON ops(entity, entity_id, field, hlc DESC);
CREATE INDEX        ix_ops_run    ON ops(run_id, hlc DESC) WHERE run_id IS NOT NULL;
CREATE UNIQUE INDEX ix_ops_dedupe ON ops(hlc, entity, entity_id, field);  -- replay idempotence

-- The LWW frontier: the winning HLC per (entity, entity_id, field). O(1) merge decisions.
CREATE TABLE op_frontier (
  entity     TEXT NOT NULL,
  entity_id  TEXT NOT NULL,
  field      TEXT NOT NULL,
  hlc        TEXT NOT NULL,
  op_id      TEXT NOT NULL,
  PRIMARY KEY (entity, entity_id, field)
);

--------------------------------------------------------------------- egress_log
CREATE TABLE egress_log (
  id           TEXT PRIMARY KEY NOT NULL,
  at           TEXT NOT NULL,
  host         TEXT NOT NULL,
  purpose      TEXT NOT NULL,   -- fetch | robots | robots-override | wayback | oembed | llm:anthropic |
                                -- llm:gemini | embed:cloud | notion | model-download | peer-send |
                                -- peer-recv | update-check | telemetry(never used)
  method       TEXT,
  item_count   INTEGER NOT NULL DEFAULT 1,
  bytes_out    INTEGER NOT NULL DEFAULT 0,
  bytes_in     INTEGER NOT NULL DEFAULT 0,
  collection_id TEXT,
  run_id       TEXT,
  scope        TEXT NOT NULL,   -- JSON: exactly which fields left ({url,title,text:2000})
  status       TEXT NOT NULL CHECK (status IN ('pending','ok','error','blocked')),
  duration_ms  INTEGER,
  error        TEXT
);
CREATE INDEX ix_egress_at   ON egress_log(at DESC);
CREATE INDEX ix_egress_host ON egress_log(host, at DESC);

--------------------------------------------------------------------- settings
CREATE TABLE settings (
  key        TEXT PRIMARY KEY NOT NULL,
  value      TEXT NOT NULL,     -- JSON
  updated_at TEXT NOT NULL
);

--------------------------------------------------------------- snapshots + knn
CREATE TABLE snapshots (
  hash       TEXT PRIMARY KEY NOT NULL,  -- blake3 of the UNCOMPRESSED html
  path       TEXT NOT NULL,              -- snapshots/<h[0:2]>/<hash>.html.zst
  bytes      INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  last_used  TEXT NOT NULL,              -- LRU key for the 5 GB cap
  ref_count  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE knn_edges (
  src_id   TEXT NOT NULL,
  k_rank   INTEGER NOT NULL,
  dst_id   TEXT NOT NULL,
  sim      REAL NOT NULL,
  model_id TEXT NOT NULL,
  built_at TEXT NOT NULL,
  PRIMARY KEY (src_id, k_rank)
) WITHOUT ROWID;   -- an index, never shared, never FTS'd: WITHOUT ROWID is safe and saves ~30 %
```

### 3.2 FTS5, external content

```sql
CREATE VIRTUAL TABLE bookmarks_fts USING fts5(
  title, summary, note, author, url_text,
  content='bookmarks', content_rowid='rowid',
  tokenize="unicode61 remove_diacritics 2"
);
CREATE TRIGGER bm_ai AFTER INSERT ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(rowid,title,summary,note,author,url_text)
  VALUES (new.rowid,new.title,new.summary,new.note,coalesce(new.author,''),
          replace(replace(new.url_norm,'/',' '),'-',' '));
END;
CREATE TRIGGER bm_ad AFTER DELETE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts,rowid,title,summary,note,author,url_text)
  VALUES ('delete',old.rowid,old.title,old.summary,old.note,coalesce(old.author,''),
          replace(replace(old.url_norm,'/',' '),'-',' '));
END;
CREATE TRIGGER bm_au AFTER UPDATE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts,rowid,title,summary,note,author,url_text)
  VALUES ('delete',old.rowid,old.title,old.summary,old.note,coalesce(old.author,''),
          replace(replace(old.url_norm,'/',' '),'-',' '));
  INSERT INTO bookmarks_fts(rowid,title,summary,note,author,url_text)
  VALUES (new.rowid,new.title,new.summary,new.note,coalesce(new.author,''),
          replace(replace(new.url_norm,'/',' '),'-',' '));
END;

CREATE VIRTUAL TABLE chunks_fts USING fts5(
  text, heading_path,
  content='chunks', content_rowid='rowid',
  tokenize="unicode61 remove_diacritics 2"
);
-- identical ai/ad/au triggers over chunks
```

`remove_diacritics 2` folds accents *and* handles the combining forms, so `"résumé"` and `"resume"` match — the single most important FTS setting for a French corpus. No Snowball stemmer (needs a custom SQLite build); instead `search/fts.ts` applies a small query-side FR/EN stem map plus a trailing `*` on the last token for prefix matching.
Bulk import switches FTS off (`DROP TRIGGER`s → insert → `INSERT INTO bookmarks_fts(bookmarks_fts) VALUES('rebuild')` → recreate triggers), which is what keeps a 100k import inside 60 s.

### 3.3 sqlite-vec, and how 256-d stays in sync with the 768-d BLOB

```sql
CREATE VIRTUAL TABLE vec_docs USING vec0(embedding float[256]);      -- addressed by rowid
CREATE TABLE vec_doc_map (
  rowid       INTEGER PRIMARY KEY AUTOINCREMENT,   -- internal to a DISPOSABLE index; never exported
  bookmark_id TEXT NOT NULL UNIQUE,
  model_id    TEXT NOT NULL,
  built_at    TEXT NOT NULL
);
CREATE TABLE vec_dirty (bookmark_id TEXT PRIMARY KEY NOT NULL, reason TEXT NOT NULL);
```

The BLOB is the truth; `vec_docs` is a cache. One function owns the projection:

```ts
// packages/core/src/embedding/matryoshka.ts
export function truncateAndRenormalise(v768: Float32Array, dim = 256): Float32Array {
  const out = v768.slice(0, dim);
  let n = 0; for (const x of out) n += x * x;
  const inv = 1 / Math.max(Math.sqrt(n), 1e-12);
  for (let i = 0; i < dim; i++) out[i]! *= inv;     // re-normalise: mandatory after truncation
  return out;
}
```

`EmbeddingStore.put()` writes `embeddings` and upserts `vec_docs`/`vec_doc_map` **in the same transaction**. If the vec write throws (extension missing, dimension mismatch), the row lands in `vec_dirty` and the BLOB write still commits — vectors are never lost to an index failure. `reindexVectors({modelId, dim})` truncates `vec_docs`/`vec_doc_map`, streams every BLOB and rebuilds; it is the migration path when the Pragmatic's "flip the index to 768-d" reverse-if fires, and it is a reindex (minutes) rather than a re-embed (nine hours). A settings key `vec.indexDim` selects 256 or 768 so the flip is a config change plus one job.

### 3.4 Zod mirror (`packages/core/src/db/schema.ts`)

One Zod object per table, hand-written to mirror the DDL, plus a drift test that reads `PRAGMA table_info` from a freshly migrated `:memory:` DB and asserts the column sets match.

```ts
export const Uuid  = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
export const Iso   = z.string().datetime({ offset: false });
export const Hlc   = z.string().regex(/^[0-9a-z]{10}\.[0-9a-z]{4}\.[1-9A-HJ-NP-Za-km-z]{8}$/);

export const BookmarkRow = z.object({
  id: Uuid, collection_id: Uuid, url: z.string().url(), url_norm: z.string(), url_hash: z.string().length(32),
  title: z.string(), summary: z.string(),
  summary_kind: z.enum(['none','extractive','llm','imported']),
  platform: z.enum(['youtube','threads','twitter','github','article','website','pdf']).nullable(),
  lang: z.string().length(2).nullable(),
  status: z.enum(['new','fetching','ready','partial','failed']),
  confidence: z.number().int().min(0).max(100).nullable(),
  /* … */ created_at: Iso, updated_at: Iso, deleted_at: Iso.nullable(),
});
export type BookmarkRow = z.infer<typeof BookmarkRow>;

export const OpRow = z.object({ /* … */ op: z.enum(['create','set','delete','move','link','unlink']) });
export const Tables = { bookmarks: BookmarkRow, ops: OpRow, /* … all 20 */ } as const;
```

The Zod objects are also what the JSON exporter and the bundle reader validate against, so the round-trip contract (§4.3) is one schema, not three.

### 3.5 Ids and HLC

**UUIDv7**, generated in core from an injected `Clock` + `Random` so tests are deterministic. Monotonic within a millisecond via a 12-bit sub-counter.

**HLC** — one fixed-width, lexicographically sortable string, `29` chars:

```
<physical ms, base36, 10 chars, zero-padded> "." <counter, base36, 4 chars> "." <actor short id, 8 base58 chars>
example:  0m3k9tz7q1.001f.7pKq3nW2
```

- `physical` = `Math.max(localNowMs, lastPhysical)`, base36 padded to 10 (good past year 5000).
- `counter` increments when physical is unchanged, resets otherwise; on receiving a remote HLC, `physical = max(local, remote.physical)` and `counter = remote.counter + 1` if physical ties.
- `actor` = first 8 base58 chars of the Ed25519 pubkey, breaking ties deterministically.

Because all three fields are fixed-width and the alphabets are ordered, **plain string comparison is the total order**. That is the whole merge rule: `a.hlc > b.hlc` wins. SQLite indexes it directly.

### 3.6 Fractional index for `tree_nodes`

Base-62 strings (`0-9A-Za-z`, ASCII-ordered so `<` on TEXT is the sort), Figma/`fractional-indexing` algorithm, plus a 4-character random suffix ("jitter") minted from the injected `Random`.

```ts
export function keyBetween(a: string | null, b: string | null, rnd: Random): string;  // a < result < b
export function keyAfter(a: string | null, rnd: Random): string;
```

The jitter is what makes concurrent inserts at the same position produce different keys, so two peers inserting between the same neighbours interleave deterministically instead of colliding. This is exactly `LoroTree`'s ordering contract, which is why P9 can adopt Loro's tree without renumbering anything.

### 3.7 `applyOp()` — the single mutation layer

```ts
// packages/core/src/ops/applyOp.ts
export interface OpInput {
  collectionId: string;
  entity: keyof typeof Tables;
  entityId: string;
  field?: string;                 // omitted for create/delete/move
  op: 'create' | 'set' | 'delete' | 'move' | 'link' | 'unlink';
  value?: unknown;                // JSON-serialisable
  runId?: string;
}
export interface OpContext {
  db: DbHandle; clock: Clock; random: Random;
  actorPubkey: string; hlc: HlcGenerator;
  origin?: 'local' | `bundle:${string}` | `peer:${string}`;
}
export interface AppliedOp { id: string; hlc: string; applied: boolean; reason?: 'stale' | 'duplicate'; }

export function applyOp(ctx: OpContext, input: OpInput): AppliedOp;
export function applyOps(ctx: OpContext, inputs: OpInput[]): AppliedOp[];   // ONE transaction
```

Body, in order: (1) mint `hlc`; (2) read the frontier for `(entity, entityId, field)`; (3) if an existing `hlc >= new.hlc`, record the op with `applied = 0`, return `{applied:false, reason:'stale'}` — **history is still kept**, only the projection is skipped; (4) read the current value into `inverse`; (5) `INSERT INTO ops`; (6) `UPDATE op_frontier`; (7) project: the actual `UPDATE bookmarks SET title = ?` etc., dispatched by a per-entity projector table; (8) touch `updated_at`. The whole thing runs inside the caller's transaction. **No feature module issues an `UPDATE` against a shareable table.** Enforced by a fourth lint zone (`from: './packages/core/src/db/queries/mutations'` allowed only for `ops/`) and by an arch test that greps for `UPDATE |INSERT INTO |DELETE FROM ` outside `ops/` and `db/migrations/`.

Exempt from `applyOp` (local-only, never shared, never undone): `jobs`, `egress_log`, `feedback_events`, `search_affinity`, `knn_edges`, `vec_*`, `snapshots`, `content_versions`, `chunks`, `embeddings`. These are derived or machine-local; the shareable set is `bookmarks, tags, tag_aliases, bookmark_tags, themes, theme_assignments, tree_nodes, collections, members`.

**LWW merge for bundle import:**

```ts
export interface FieldState { v: unknown; hlc: string }
export interface EntityState { entity: string; id: string; fields: Record<string, FieldState>; deletedAt?: FieldState }
export function mergeEntity(ctx: OpContext, incoming: EntityState): { applied: number; skipped: number };
```

For each field, compare `incoming.hlc` against the frontier by string comparison; if greater, call `applyOp` with `origin: 'bundle:<hash>'` and the incoming HLC preserved verbatim (the HLC generator also advances its physical clock to `max(local, incoming)`). Deletes are tombstones (`deleted_at` is a field like any other), so a delete and a concurrent edit resolve by HLC rather than by row existence. Expected size: ~120 lines. **The Pragmatic's reverse-if — "over ~300 lines or needing per-type conflict rules" — is measured against this file.**

**What P9 changes (the seam).** `applyOp`'s signature and the `ops` table stay. Its body's steps 2–6 (frontier compare, insert, project) are replaced by `doc.getMap(entity).set(field, value)` on the collection's `LoroDoc`, with the SQLite projection driven by Loro's subscription callback instead of by step 7. `mergeEntity` is deleted and replaced by `doc.import(bytes)`. `run_items`, `runs`, `jobs` and all derived tables are untouched. The `ops` table becomes the *audit log* rather than the source of truth, and the HLC becomes Loro's internal `(peer, counter)` — which is why the actor id is already inside the HLC string.

### 3.8 `runs` as the undo unit

**Proposing.** A run writes `run_items`, never `ops`. `runs.status = 'proposed'`. Nothing is visible in the library yet; the Review queue reads `run_items`.

**Accepting.** In one `db.transaction()`: for each item with `decision='accept'`, call `applyOp({...item, runId})` and store the returned `op.id` back into `run_items.op_id`. Set `runs.status` to `accepted` (all decided and accepted) or `partial`.

**Reverting.** `runs:revert` opens a **new** run of `kind='revert'` with `reverts_run_id` set, then:

```sql
SELECT * FROM ops WHERE run_id = :runId AND applied = 1 ORDER BY hlc DESC;
```

and for each row calls `applyOp` with `value = JSON(ops.inverse)` and a **fresh HLC**, stamped with the new `run_id`. Atomic because it is one transaction; correct across peers because a revert is an ordinary set of later-HLC ops that a friend's machine merges like any other. `create` inverts to a `delete` tombstone; `move` inverts to the prior `(parent_id, frac_index)` pair. Expiry: a nightly job sets `status='expired'` where `expires_at < now`, which only stops the *UI* offering undo — the ops remain, so a determined user can still revert via the SQL console.

### 3.9 Migrations

`packages/core/src/db/migrations/NNNN_name.sql` is the source of truth. `apps/desktop/scripts/gen-migrations.mjs` concatenates them into `migrations.generated.ts`:

```ts
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  { version: 1, name: 'init', sql: `PRAGMA foreign_keys=OFF; ...` },
];
```

because core cannot read files. `migrate(db: DbHandle)` reads `PRAGMA user_version`, applies each later migration inside `BEGIN IMMEDIATE` with `PRAGMA foreign_keys=OFF` around it, sets `PRAGMA user_version = n`, commits per migration. Before the first migration of a session that will raise `user_version`, main copies `library.db` to `library.db.pre-<n>.bak` using `db.backup()` and keeps the last three. A generator test asserts `migrations.generated.ts` is in sync with the `.sql` files (CI fails if someone edits SQL without regenerating).

---

## 4. Core module APIs (`packages/core`)

Signatures only. Every module takes its I/O through a port; none of them import `node:`.

### 4.0 Ports

```ts
export type SqlValue = null | number | bigint | string | Uint8Array;
export interface Statement {
  all<T = unknown>(...p: SqlValue[]): T[];
  get<T = unknown>(...p: SqlValue[]): T | undefined;
  run(...p: SqlValue[]): { changes: number; lastInsertRowid: number | bigint };
  iterate<T = unknown>(...p: SqlValue[]): IterableIterator<T>;
}
export interface DbHandle {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  transaction<A extends unknown[], R>(fn: (...a: A) => R): (...a: A) => R;
  pragma(s: string): unknown;
}
export interface FetchLike {
  (url: string, init?: { method?: string; headers?: Record<string,string>;
                         body?: string | Uint8Array; timeoutMs?: number; redirect?: 'follow'|'manual' })
    : Promise<{ status: number; headers: Record<string,string>; finalUrl: string;
                text(): Promise<string>; bytes(): Promise<Uint8Array> }>;
}
export interface FileStore {                       // content-addressed, BLAKE3
  put(bytes: Uint8Array): Promise<{ hash: string; bytes: number }>;
  get(hash: string): Promise<Uint8Array | null>;
  has(hash: string): Promise<boolean>;
  delete(hash: string): Promise<void>;
  usage(): Promise<{ bytes: number; count: number }>;
}
export interface Clock  { now(): number; iso(): string }
export interface Random { bytes(n: number): Uint8Array; float(): number }
export interface SecretStore { get(k: string): string | null; set(k: string, v: string): void; delete(k: string): void }
export interface Logger { debug(m: string, d?: object): void; info(...): void; warn(...): void; error(...): void }
```

### 4.1 `UrlNormalizer`

Port of `stripUtmParams` (`legacy/App.tsx:57`) plus the dedupe Set from `handleProcessUrls`, widened.

```ts
export interface NormalizeOptions {
  stripTracking?: boolean;   // default true: utm_*, fbclid, gclid, mc_eid, igshid, ref, ref_src, si, spm
  stripFragment?: boolean;   // default true UNLESS the fragment is a SPA route (#!/…) or a doc anchor we keep
  lowercaseHost?: boolean;   // default true
  stripWww?: boolean;        // default false — some hosts 404 without it; normalised only for the hash
  sortQuery?: boolean;       // default true
  canonicalPlatform?: boolean; // youtu.be/X → youtube.com/watch?v=X; x.com → twitter.com; m.→www.
}
export function normalizeUrl(raw: string, o?: NormalizeOptions): { url: string; norm: string; hash: string; host: string; registrable: string };
export function isProbablyUrl(s: string): boolean;
export function dedupe<T extends { url: string }>(items: T[], existing: Iterable<string>):
  { unique: (T & { norm: string })[]; duplicates: { item: T; existingNorm: string }[] };
```

`hash` = blake3(norm) hex, first 32 chars — the `bookmarks.url_hash` unique index. Keeping `url` (original) beside `url_norm` is what makes the round-trip export lossless.

### 4.2 `Importers`

```ts
export type ImporterId = 'netscape'|'chrome'|'firefox'|'raindrop'|'karakeep'|'pocket'|'csv'|'notion';
export interface BookmarkDraft {
  url: string; title?: string; note?: string; summary?: string;
  tags?: string[]; folderPath?: string[]; createdAt?: string; author?: string;
  extra?: Record<string, unknown>;               // preserved verbatim into bookmarks.note metadata
}
export interface ImportSource { kind: 'text'|'bytes'|'rows'; text?: string; bytes?: Uint8Array; rows?: Record<string,string>[] }
export interface ImportResult {
  drafts: BookmarkDraft[]; malformed: { line?: number; raw: string; reason: string }[];
  detected: { folders: number; tags: number; dateRange: [string, string] | null };
}
export interface Importer {
  id: ImporterId;
  sniff(src: ImportSource): number;                       // 0..1 confidence, drives auto-detection
  parse(src: ImportSource, opts?: unknown): ImportResult; // SYNCHRONOUS and pure except notion
}
export const importers: Record<ImporterId, Importer>;
```

- **netscape**: port of the `UrlInput.tsx` regexes, promoted from line-wise to a real `linkedom` DOM walk so `<H3>` folder nesting becomes `folderPath[]` and `ICON`/`ADD_DATE`/`LAST_MODIFIED`/`TAGS` are read. The old line regexes stay as the fallback path for *pasted fragments* (the current UX), tested by the same fixtures.
- **chrome**: the `Bookmarks` JSON tree; `date_added` is WebKit epoch (µs since 1601) → `(n/1000 - 11644473600000)`.
- **firefox**: `moz_bookmarks ⋈ moz_places` over a **copy** of `places.sqlite` (the host copies; core receives an already-open `DbHandle`).
- **raindrop**: CSV `folder,title,note,excerpt,url,tags,created` via the generic mapper with a preset.
- **karakeep**: JSON export — the richest source: tags, notes, highlights → `note` + `bookmark_tags(source='import')`.
- **pocket**: legacy ZIP of CSVs split every 10k, plus `annotations/`; the host unzips, core sees rows.
- **csv**: `inferMapping(headers, sampleRows) → ColumnMapping` + `applyMapping`. This is the long tail and Notion's front end.
- **notion (v1.5)**:

```ts
export interface NotionClient {
  listDatabases(): Promise<{ id: string; title: string }[]>;
  getDataSources(databaseId: string): Promise<{ id: string; name: string; schema: Record<string, NotionProp> }[]>;
  queryDataSource(dataSourceId: string, cursor?: string):
    Promise<{ results: NotionPage[]; next_cursor: string | null }>;
  firstBlocks(pageId: string, n: number): Promise<string>;   // markdown, ONE level, no recursion
}
export function notionToDrafts(pages: NotionPage[], mapping: ColumnMapping): ImportResult;
```

Header `Notion-Version: 2025-09-03`; `databases/:id` → `data_sources[]`, then `POST /v1/data_sources/:id/query`; ~3 rps through the same limiter; `notionFetch`'s 429 `Retry-After` backoff is ported verbatim from `legacy/services/notionService.ts`. No relations, rollups, formulas, file downloads or workspace walk — the properties go through the *same* `ColumnMapping` UI as CSV.

### 4.3 `Exporters`

```ts
export interface ExportSink { write(chunk: string | Uint8Array): Promise<void>; close(): Promise<void> }
export interface Exporter { id: 'json'|'netscape'|'markdown'; run(db: DbHandle, sink: ExportSink, opts): Promise<{ items: number; bytes: number }> }
```

All streaming (`sink.write` per record, never a concatenated string). **The JSON round-trip contract**, tested in CI: `import(export(db)) ≍ db` for every column of every shareable table plus `content_versions.text`, `chunks`, `embeddings` (base64 f32) and `ops`. The file is JSONL with a header record:

```json
{"$schema":"cairn/export/1","exportedAt":"…","app":"0.1.0","dbVersion":7,"counts":{…}}
{"t":"collection","v":{…}}
{"t":"bookmark","v":{…},"versions":[…],"chunks":[…],"tags":[…]}
{"t":"op","v":{…}}
```

Netscape and Markdown are lossy by design and say so in a header comment. `library.db` copy uses `db.backup()` (host side) so it is consistent under WAL. `docs/recovery.md` documents the plain `sqlite3` recipe so export never depends on the app being healthy.

### 4.4 `Acquisition`

```ts
export interface AcquisitionResult {
  ok: boolean;
  method: 'api:github'|'api:arxiv'|'api:hn'|'api:reddit'|'api:bluesky'|'api:mastodon'|'api:wikipedia'
        | 'shim:youtube'|'shim:x'|'shim:threads'
        | 'http:defuddle'|'http:readability'|'pdf:unpdf'|'pdf:ocr'
        | 'render:bw'|'archive:wayback'|'cloud:gemini'|'og-only'|'failed';
  tier: 0|1|2|3|4|6|7|8;
  httpStatus?: number; finalUrl?: string;
  title?: string; author?: string; publishedAt?: string; platform?: Platform;
  lang?: string;                       // franc over the first 4 kB
  text?: string; html?: string;
  snapshotHash?: string;
  thumbnailUrl?: string;
  confidence: number;                  // 0..100
  confidenceReason: string;            // ported wording from legacy/server.ts
  extractorVersion: string;
  tookMs: number; error?: string;
}
export interface TierContext { fetch: FetchLike; clock: Clock; logger: Logger;
  limiter: RateLimiter; robots: RobotsCache; files?: FileStore; render?: RenderPort }
export interface Tier {
  id: string; tier: number;
  accepts(u: ParsedUrl): boolean;          // hostname/pattern routing
  run(u: ParsedUrl, ctx: TierContext): Promise<AcquisitionResult | null>;  // null = "not mine, next tier"
}
export function createRouter(tiers: Tier[], policy: AcquisitionPolicy): {
  acquire(url: string, ctx: TierContext, opts?: { maxTier?: number; allowCloud?: boolean }): Promise<AcquisitionResult>;
};
export interface RenderPort { render(url: string, o: { timeoutMs: number; idleMs: number }):
  Promise<{ html: string; finalUrl: string; status: number }> }   // implemented by the fetcher window
export interface RateLimiter { acquire(key: string): Promise<() => void>; }  // returns release()
export interface RobotsCache { allowed(url: string, ua: string): Promise<boolean>; }
```

Router: first `accepts()` wins per tier, ascending; stop at the first `ok`. Tier 8 always returns a result, so `acquire` never rejects — the graceful-failure invariant is structural.

**The four ported extractors.** `legacy/services/geminiService.ts` `fetchTweetContext` / `fetchThreadsContext` / `fetchYouTubeContext` / `fetchWebContext` become tier-1 `Tier` objects. Changes: the `proxyUrl` parameter and the X bearer-token branch are deleted (the proxy was a CORS workaround that Electron makes unnecessary; the bearer flow is discarded per the inventory), leaving X on FxEmbed + syndication; YouTube's oEmbed + HTML-meta + playlist-title logic is kept and gains `youtubei.js` as a preferred sub-step; `fetchWebContext`'s OpenGraph reader becomes **tier 8**, the never-fails floor.

**Ported post-processing.** `legacy/server.ts` lines ~174–250 become `acquisition/postprocess.ts`, a pure function over an `AcquisitionResult`: platform detection from the URL (the same `youtube.com|youtu.be` / `threads` / `twitter|x.com` / `github` ladder), the YouTube 11-char video-id regex → `img.youtube.com/vi/<id>/hqdefault.jpg`, publication-date validation (`getFullYear() > 1970`), the domain-fallback title, and the confidence ladder (`youtube|threads → 92/75`, `twitter → 95/20`, else `88/78`, with the three reason strings). It moves from the Gemini response handler to the acquisition result because **confidence is a property of how we got the content, not of what an LLM said about it**.

### 4.5 `Chunker`

```ts
export interface Chunk { ord: number; headingPath: string; charStart: number; charEnd: number; tokenEst: number; page?: number; text: string }
export interface ChunkOptions { targetTokens?: 450; overlapTokens?: 60; maxTokens?: 700; minTokens?: 80; neverCrossHeadings?: true }
export function chunkText(text: string, opts?: ChunkOptions): Chunk[];
export function chunkMarkdown(md: string, opts?: ChunkOptions): Chunk[];      // h1–h3 aware
export function chunkPdf(pages: { page: number; text: string }[], opts?: ChunkOptions): Chunk[];
export function estimateTokens(s: string): number;   // chars/3.6 for FR, /4.0 for EN; no tokenizer dep
```

Offsets are into the **stored `content_versions.text`**, so a citation chip can deep-link `bookmark#charStart` and highlight without re-fetching.

### 4.6 `EmbeddingProvider`

```ts
export interface EmbeddingProvider {
  readonly modelId: string;      // 'embeddinggemma-300m-q8'
  readonly dim: 768;
  readonly maxTokens: number;    // 2048
  embed(texts: string[], opts?: { prefix?: 'query'|'document'; signal?: AbortSignal }): Promise<Float32Array[]>;
  embedBatched(texts: string[], batch = 16, onProgress?: (done: number, total: number) => void): Promise<Float32Array[]>;
}
export function truncateAndRenormalise(v: Float32Array, dim?: number): Float32Array;
export function cosine(a: Float32Array, b: Float32Array): number;    // both pre-normalised → dot product
export function packF32(v: Float32Array): Uint8Array;
export function unpackF32(b: Uint8Array): Float32Array;
```

EmbeddingGemma needs task prefixes (`search_query:` / `title: none | text:`), which `prefix` selects — getting this wrong costs several MTEB points, so it is in the signature rather than a caller convention. Host implementation: `onnxruntime-node` CPU session in main, tokenizer from `@huggingface/transformers`. Every write stamps `model_id` and `dim`; a model change does not invalidate old rows, it adds rows, and a `reindexVectors` job switches which `model_id` the index reads. **CPU-only whenever the inference process holds an LLM** (§2.4).

### 4.7 `GenerationProvider` — the firewalled module

```ts
export interface GenerationProvider {
  readonly id: 'ollama'|'lmstudio'|'localpack'|'anthropic'|'google'|'extractive';
  readonly modelId: string;
  readonly capabilities: { json: boolean; streaming: boolean; batch: boolean; maxContextTokens: number };
  probe(): Promise<{ available: boolean; reason?: string; etaTokensPerSecond?: number }>;
  generateObject<T>(args: { schema: ZodType<T>; system: string; prompt: string;
    maxTokens: number; temperature?: number; signal?: AbortSignal }): Promise<{ value: T; usage: Usage }>;
  generateText(args: { system: string; prompt: string; maxTokens: number;
    onToken?: (t: string) => void; signal?: AbortSignal }): Promise<{ text: string; usage: Usage }>;
  submitBatch?<T>(items: { id: string; schema: ZodType<T>; system: string; prompt: string }[]):
    Promise<{ batchId: string }>;
  pollBatch?<T>(batchId: string): Promise<{ status: 'running'|'ended'|'failed';
    results?: { id: string; value: T; usage: Usage }[] }>;
}
export function probeChain(candidates: GenerationProvider[]): Promise<GenerationProvider>;
```

Probing order: **detected Ollama** (`GET 127.0.0.1:11434/api/tags`, 300 ms timeout; the dev machine wins here with 15 models) → **LM Studio** (`1234/v1/models`) → **local pack** (node-llama-cpp, only if `models/localpack/` exists and verifies) → **cloud** (a key present in `safeStorage`) → **extractive**. The chosen provider is sticky in settings; re-probe on `providers:probe {force}` and on three consecutive failures.

Backends:
- `ollama` — `ollama-ai-provider-v2` through Vercel AI SDK 7; structured output via `format: <JSON Schema>`.
- `localpack` — node-llama-cpp 3.20 in the inference `utilityProcess`, GBNF grammar from the same JSON Schema; downloaded on demand (§7.4).
- `anthropic` — `@ai-sdk/anthropic`, `claude-haiku-4-5`; `output_config: { format: {…} }` (not the deprecated `output_format`); `thinking: {type:'adaptive'}` + `output_config.effort:'low'`; `cache_control: {type:'ephemeral'}` on the long system prompt; **Batches** via `submitBatch`/`pollBatch` at 50 %.
- `google` — `@ai-sdk/google`, `gemini-3.8-flash` from config (never hardcoded — that is the bug in `legacy/services/geminiService.ts:286`), `responseSchema` + `responseMimeType: 'application/json'`, `googleSearch` grounding only for tier 7.
- `extractive` — no network, no model: 3-sentence lead by position + TextRank tiebreak, keyphrases by the KeyBERT-style path in §4.9. Implements the full interface so every caller works with zero providers.

**One Zod schema per task, declared once** in `generation/schemas.ts` and converted per backend:

```ts
export const SummarySchema = z.object({
  title: z.string().max(200), summary_fr: z.string().max(900), summary_en: z.string().max(900),
  keywords: z.array(z.string().max(40)).min(3).max(8),
  platform: z.enum(['youtube','threads','twitter','github','article','website','pdf']),
  confidence: z.number().int().min(0).max(100), confidence_reason: z.string().max(200),
});
export const ClusterLabelSchema = z.object({
  label_fr: z.string().max(60), label_en: z.string().max(60),
  description_fr: z.string().max(240), description_en: z.string().max(240),
  emoji: z.string().max(4), parent_hint: z.string().max(60).nullable(),
});
export const TagMergeSchema = z.object({
  canonical: z.string(), aliases: z.array(z.string()),
  translations: z.object({ fr: z.string(), en: z.string() }),
  confidence: z.number().min(0).max(1), reason: z.string().max(200),
});
export const AdjudicateSchema = z.object({ themeId: z.string(), confidence: z.number(), reason: z.string().max(160) });
```

Always `schema.parse()` the result even when the backend claims strict mode; a parse failure retries once with the error appended to the prompt, then falls to `extractive` and marks the item for review.
### 4.8 `Search`

```ts
export interface SearchScope { kind: 'global'|'collection'|'selection'; ids?: string[] }
export interface SearchHit { bookmarkId: string; score: number; ftsRank?: number; vecRank?: number;
  snippet?: string; matchedFields: string[]; boosts: Record<string, number> }
export interface SearchOptions { limit?: 50; ftsK?: 50; vecK?: 50; rrfK?: 60;
  mode?: 'hybrid'|'fts'|'vector'; applyBoosts?: true; filters?: LibraryFilters }

export function search(db: DbHandle, emb: EmbeddingProvider, q: string,
                       scope: SearchScope, o?: SearchOptions): Promise<{ hits: SearchHit[]; tookMs: number }>;
export function rrf(lists: { id: string; rank: number }[][], k = 60): { id: string; score: number }[];
export function postRrfBoost(hits: SearchHit[], aff: AffinityTable, now: number): SearchHit[];
export function rebuildAffinity(db: DbHandle, now: number): { rows: number };   // nightly job
```

`score' = rrf × (1 + 0.20·tagAff + 0.15·domainAff + 0.10·log1p(openCount)) × (0.7 + 0.3·exp(−ageDays/365))`, weights in `settings`. `scope='global'` runs sqlite-vec `MATCH` over `vec_docs` (exact brute force, 256-d, ~40–90 ms at 100k); `scope='selection'` restricts to the id set and brute-forces the 768-d BLOBs directly (exact, <10 ms for ≤5k). FTS always runs over `bookmarks_fts`; chunk-level FTS+vector is used only by `AskSelection`.

### 4.9 `Clustering`

```ts
export interface KnnOptions { k?: 15; minSim?: 0.25; modelId: string; dim?: 256 }
export function buildKnnGraph(db: DbHandle, o: KnnOptions,
  onProgress?: (done: number, total: number) => void): Promise<{ edges: number; tookMs: number }>;  // writes knn_edges

export interface LouvainOptions { resolutions?: [0.4, 1.0, 2.0]; seed?: 42; minClusterSize?: 5 }
export interface Community { resolution: number; clusterId: number; members: string[] }
export function louvainMultiResolution(db: DbHandle, o?: LouvainOptions): Community[];   // graphology

export interface CtfidfOptions { topK?: 8; stopwords: { fr: Set<string>; en: Set<string> };
  foldDiacritics?: true; ngram?: [1, 2]; minDf?: 2 }
export function cTfIdf(docs: { id: string; text: string; cluster: number }[], o: CtfidfOptions):
  Map<number, { term: string; score: number }[]>;

export function extractKeyphrases(text: string, docVec: Float32Array, emb: EmbeddingProvider,
  o?: { n?: 5; ngram?: [1,3]; mmrLambda?: 0.6 }): Promise<string[]>;   // KeyBERT-style, embeddings only

export interface LabelJobInput { clusters: { clusterId: number; resolution: number;
  terms: string[]; titles: string[]; summaries: string[] }[] }
export function planLabelRun(input: LabelJobInput): { calls: number; etaSeconds: number; costEur: number };
export function labelClusters(gen: GenerationProvider, input: LabelJobInput,
  onEach: (r: ClusterLabel) => void, signal?: AbortSignal): Promise<RunItemDraft[]>;
export function dedupeSiblings(gen: GenerationProvider, siblings: ClusterLabel[][]): Promise<RunItemDraft[]>;

export interface AssignOptions { marginThreshold?: 0.02; unclassifiedLabel?: { fr: 'À classer'; en: 'Unsorted' } }
export function assignByCentroid(db: DbHandle, themes: ThemeRow[], resolution: number, o?: AssignOptions):
  { assigned: number; ambiguous: string[]; unclassified: number };
export function adjudicateTail(gen: GenerationProvider, ambiguous: string[], db: DbHandle): Promise<RunItemDraft[]>;
```

`buildKnnGraph` is the expensive step: 100k sqlite-vec top-16 queries. It runs in batches of 500 inside one transaction each, is resumable (`knn_edges.built_at` + a `jobs` cursor), and reports progress. Only documents whose embedding `model_id` matches are included. `louvainMultiResolution` loads `knn_edges` into a `graphology` `UndirectedGraph` (1.5 M edges, ~250 MB transient — it runs in the layout `utilityProcess`, not main) and calls `graphology-communities-louvain` with a fixed `rng` seeded at 42, so the same corpus gives the same communities.

**c-TF-IDF details that matter:** documents are the *concatenation of title + summary + first chunk* (not full text — full text is noise at cluster scale); terms are diacritic-folded and lowercased before counting but the **display form is the most frequent surface form**, so "Photographie" shows with its accent; FR and EN stopword lists are unioned because clusters are routinely mixed-language; bigrams are kept when `df(bigram) > 0.6·df(head unigram)`.

### 4.10 `TagConsolidation`

```ts
export function normaliseTag(raw: string, lang?: 'fr'|'en'): string;     // NFKC → casefold → strip diacritics
                                                                        // → singularise (FR: -s/-x/-aux; EN: -s/-es/-ies)
                                                                        // → trim punctuation → collapse whitespace/hyphens
export interface MergeCandidate { canonicalGuess: string; members: { tagId: string; label: string; count: number }[];
  cohesion: number; jaccard: number }
export function clusterTags(tags: TagWithVector[], o?: { threshold?: 0.88; linkage?: 'average' }): MergeCandidate[];
export function homonymGuard(c: MergeCandidate, cooc: CooccurrenceIndex, min = 0.05): MergeCandidate[];  // splits
export function adjudicateMerges(gen: GenerationProvider, cands: MergeCandidate[],
  onEach: (r: TagMerge) => void): Promise<RunItemDraft[]>;
export function planConsolidation(db: DbHandle): { tags: number; candidates: number; llmCalls: number; etaSeconds: number };
```

Pipeline exactly as the Expert's §10(a): normalise → embed (tags are `owner_type='tag'` rows, so the vectors are reused) → agglomerative average-linkage at cosine ≥ 0.88 → Jaccard < 0.05 co-occurrence guard splits homonym groups ("Python" the language vs the snake) → one LLM call per surviving group returning `TagMergeSchema` → **`run_items`, never a merge.** Accepting a merge item creates `tag_aliases` rows and rewrites `bookmark_tags`, both through `applyOp`, so rejecting later reverts cleanly.

### 4.11 `Trees`

```ts
export interface TreeNode { id: string; parentId: string | null; fracIndex: string;
  kind: 'theme'|'query'|'pin'|'folder'|'bookmark'; refId: string | null;
  labelFr: string; labelEn: string; emoji?: string; pinned: boolean; userEdited: boolean; depth: number }

export function materialiseTree(db: DbHandle, collectionId: string, runId: string,
  o?: { maxDepth?: 4; resolutions?: [0.4,1.0,2.0] }): RunItemDraft[];

export interface MatchOptions { minCosine?: 0.80 }
export function matchThemes(oldThemes: ThemeRow[], newThemes: ThemeRow[], o?: MatchOptions):
  { keep: { oldId: string; newId: string; sim: number }[]; added: string[]; removed: string[] };

export function queryTree(db: DbHandle, emb: EmbeddingProvider, q: string, scope: SearchScope,
  o?: { topN?: 500; maxDepth?: 3 }): Promise<TreeNode[]>;     // EPHEMERAL — nothing persisted
export function pinBranch(ctx: OpContext, collectionId: string, parentId: string, branch: TreeNode[]): string;
export function moveNode(ctx: OpContext, nodeId: string, newParentId: string | null,
  before?: string, after?: string): string;                    // returns the new fracIndex
```

**Stable-id matching** is greedy, not Hungarian: sort candidate `(old, new)` pairs by centroid cosine descending, take pairs greedily under a one-to-one constraint, threshold 0.80. A matched new theme *inherits the old `tree_nodes.id`*, so user drags, renames and pins survive regeneration. An unmatched old node with `pinned=1` or `user_edited=1` is preserved and reparented under a generated "Anciens thèmes / Former themes" folder rather than deleted — losing a user's pinned branch is the one failure that ends trust in the feature. Depth is capped at 4 by construction and by the `CHECK` constraint.

`queryTree` is the Doubtful's disposable projection: top-N results → kNN subgraph from `knn_edges` (already cached) → Louvain at r=1.0 → c-TF-IDF labels, **no LLM call at all** unless a provider is present *and* the user asks for prettier labels. ≤500 docs → under 300 ms.

### 4.12 `MapLayout`

```ts
export interface LayoutInput { ids: string[]; vectors: Float32Array;  // n × dim, row-major
  dim: number; strata: Uint16Array }                                  // theme or domain-hash bucket
export interface LayoutOptions { landmarks?: 9000; nNeighbors?: 15; minDist?: 0.1; seed?: 42; knn?: 10 }
export interface LayoutOutput { ids: string[]; xy: Float32Array; landmarkCount: number; tookMs: number }
export function computeLayout(input: LayoutInput, o?: LayoutOptions,
  onProgress?: (phase: 'sample'|'umap'|'place', done: number, total: number) => void): LayoutOutput;
export function stratifiedSample(strata: Uint16Array, n: number, rnd: Random): Uint32Array;
```

Landmark UMAP: stratified sample of ~9k by `(theme_at_r1 ?? hash(registrable_domain)) × time_bucket`, `umap-js` fit on those, then every remaining point is placed at the inverse-distance-weighted centroid of its 10 nearest landmarks in *embedding* space (`w = 1/(d+ε)²`), plus a 0.5-unit deterministic jitter from the seeded `Random` so identical vectors do not stack into one pixel. Output is written to `bookmarks.map_x/map_y/map_run_id`. UMAP is presentation only and never feeds clustering.

### 4.13 `AskSelection`

```ts
export interface AskScope { kind: 'selection'|'collection'|'theme'; ids?: string[]; themeId?: string }
export interface RetrievedChunk { chunkId: string; bookmarkId: string; title: string;
  headingPath: string; charStart: number; text: string; score: number; used: boolean }
export interface AskPlan { chunks: RetrievedChunk[]; contextTokens: number; truncated: boolean }
export function planAsk(db: DbHandle, emb: EmbeddingProvider, q: string, scope: AskScope,
  o?: { maxChunks?: 500; ftsK?: 50; vecK?: 50; topK?: 8; contextTokens?: 3000 }): Promise<AskPlan>;
export function buildPrompt(plan: AskPlan, q: string, locale: 'fr'|'en'): { system: string; prompt: string };
export function parseCitations(answer: string, plan: AskPlan):
  { markers: { chunkId: string; at: number }[]; unknown: string[] };
export function askSelection(db, emb, gen: GenerationProvider | null, q, scope, o?):
  AsyncIterable<{ kind:'passages'|'token'|'done'|'error'; … }>;
```

Candidate set is capped at 500 chunks *before* retrieval (the scope's bookmarks' chunks, most recent version only). BM25 k=50 + exact brute-force vector k=50 over the 768-d BLOBs → RRF(60) → top 6–8 → pack to ≤3,000 tokens, compressing any chunk over 250 tokens to its two highest-scoring sentences. Citations are `[[c:<chunkId>]]`; if the answer contains zero markers the call is retried once with an explicit instruction, then the answer is shown with a "non sourcé / unsourced" badge. **With `gen === null` the generator yields exactly the `passages` event and stops** — ranked passages are the no-LLM product, not an error state.

### 4.14 `JobQueue`

```ts
export type JobKind = 'fetch'|'embed'|'chunk'|'summarise'|'knn'|'louvain'|'label'|'assign'
                    | 'consolidate'|'layout'|'affinity'|'import'|'export'|'bundle'|'snapshotGc';
export interface Job { id: string; kind: JobKind; payload: unknown; priority: 0|1|2|3|4;
  attempts: number; maxAttempts: number; notBefore?: string; dedupeKey?: string; runId?: string }
export interface Throttle { paused: boolean; reasons: ('battery'|'thermal'|'typing'|'user'|'cap')[] }
export interface QueuePolicy {
  concurrency: Partial<Record<JobKind, number>>;     // fetch 4, embed 1, summarise 1, knn 1, layout 1
  nightlyCaps: { summarise: 300 };
  dailyCaps: { fetch: 2000 };
  windows: { summarise?: { fromHour: 22; toHour: 7 } };
}
export interface JobHandlers { [K in JobKind]: (job: Job, ctx: JobCtx) => Promise<void> }
export function createQueue(db: DbHandle, handlers: JobHandlers, policy: QueuePolicy, clock: Clock): {
  enqueue(j: Omit<Job,'id'|'attempts'>): string;
  enqueueMany(js: Omit<Job,'id'|'attempts'>[]): string[];      // one transaction
  tick(): Promise<void>;                                       // called on a 250 ms timer
  pause(reason): void; resume(reason): void;
  state(): { running: Job[]; pending: number; byKind: Record<JobKind, number>; throttle: Throttle };
};
```

Persistence is the `jobs` table with a lease (`lease_until`); a crash leaves leases that expire in 5 minutes and the job is retried. `dedupe_key` (e.g. `fetch:<bookmarkId>`) plus the partial unique index makes "enqueue if not already queued" a single statement. Throttles are host-supplied signals wired into `pause()/resume()`: `powerMonitor.isOnBatteryPower()`, a thermal proxy (three consecutive ticks where a calibration loop takes >2× baseline), and "user typed in the last 1,500 ms". Caps: `summarise` refuses past 300 successes in a rolling night; `fetch` past 2,000 in a rolling 24 h, and bulk backfill must be started explicitly from the UI (never by an import).

### 4.15 `Bundle` — the `.bkmshare` format

```
offset  content
0       magic        "BKMSHARE" (8 bytes)
8       u16 LE       formatVersion = 1
10      u32 LE       headerLen
14      header       JSON, CLEARTEXT (see below)
…       segments     each XChaCha20-Poly1305 sealed under K_epoch,
                     AAD = blake3(headerBytes) ‖ segmentName
…       u32 LE sigLen
…       signature    Ed25519 over (headerBytes ‖ blake3(all ciphertext))
```

```jsonc
// header (cleartext — a recipient must find their wrapped key without a key)
{
  "v": 1, "collectionId": "…", "name": "Photographie argentique", "epoch": 3,
  "createdAt": "2026-09-12T…", "producer": { "app": "cairn/0.1.0" },
  "signerPubkey": "base58…",
  "recipients": [
    // recipients are ADDRESSED, not named: blake3(pubkey ‖ collectionId ‖ epoch)[0:16] hex.
    // A bundle therefore never reveals the member list to someone who holds it.
    { "tag": "9f2c…", "wrapped": "base64(X25519 sealed K_epoch)", "nonce": "base64" }
  ],
  "segments": [
    { "name": "records.jsonl.zst", "kind": "state", "offset": 4096, "len": 182734,
      "nonce": "base64", "plainHash": "blake3…", "records": 412 },
    { "name": "text.tar.zst",       "kind": "text",       … },
    { "name": "embeddings.f32",     "kind": "vectors", "dim": 768, "modelId": "embeddinggemma-300m-q8", … },
    { "name": "snapshots.tar.zst",  "kind": "snapshots",  … }     // optional, confirmed by size
  ],
  "sizeBytes": 18234112
}
```

```ts
export interface BundleWriteOptions { collectionId: string; recipients: { pubkey: string; x25519: string }[];
  includeSnapshots: boolean; includeEmbeddings?: true; mode?: 'state'|'ops' }
export function writeBundle(db: DbHandle, crypto: CryptoPort, files: FileStore,
  sink: ExportSink, o: BundleWriteOptions): Promise<{ bytes: number; records: number; warning?: string }>;
export function readBundleHeader(src: ByteSource): Promise<BundleHeader>;
export function openBundle(src: ByteSource, crypto: CryptoPort, myX25519Priv: Uint8Array):
  Promise<AsyncIterable<EntityState | TextRecord | VectorRecord>>;
export function importBundle(ctx: OpContext, stream: AsyncIterable<…>, origin: `bundle:${string}`):
  Promise<{ newItems: number; updatedItems: number; skipped: number; conflicts: ConflictReport[] }>;
```

`mode: 'state'` (the v1 default) writes each entity's **LWW frontier** — `{entity, id, fields: {name: {v, hlc}}}` — which is exactly a compressed op log and exactly what a Loro shallow snapshot is. `mode: 'ops'` writes raw `ops` rows for a full-history transfer. **Import is `mergeEntity()` per record, in one transaction**, never an overwrite, so a friend's local edits to a shared item survive unless the incoming HLC is later. Size warning when `sizeBytes > 200 MB` or `includeSnapshots` would add >50 MB; snapshots are refused silently-never — the user confirms the number.

### 4.16 `Identity`

```ts
export interface CryptoPort {          // @noble/curves + @noble/ciphers + @noble/hashes, all pure JS
  ed25519: { sign(msg: Uint8Array, sk: Uint8Array): Uint8Array;
             verify(sig: Uint8Array, msg: Uint8Array, pk: Uint8Array): boolean;
             getPublicKey(sk: Uint8Array): Uint8Array };
  x25519:  { fromEd25519(sk: Uint8Array): { priv: Uint8Array; pub: Uint8Array };
             seal(plain, recipientPub): { ct: Uint8Array; nonce: Uint8Array; ephPub: Uint8Array };
             open(ct, nonce, ephPub, priv): Uint8Array };
  aead:    { seal(plain, key, nonce, aad): Uint8Array; open(ct, key, nonce, aad): Uint8Array };  // XChaCha20-Poly1305
  blake3:  (b: Uint8Array) => Uint8Array;
  random:  (n: number) => Uint8Array;
}
export function createIdentity(c: CryptoPort): { mnemonic: string[]; ed25519Priv: Uint8Array; pubkey: string };
export function restoreIdentity(c: CryptoPort, mnemonic: string[]): { ed25519Priv: Uint8Array; pubkey: string };
export function fingerprint(pubkey: string): string;                 // 6 groups of 4 base32 — read aloud on the phone
export function newEpochKey(c: CryptoPort): Uint8Array;              // 32 random bytes
export function wrapEpochKey(c, key, memberX25519Pub): WrappedKey;
export function rotateEpoch(ctx: OpContext, collectionId: string, members: Member[]): { epoch: number };
```

BIP39 24 words (`@scure/bip39`) → seed → Ed25519 private key. The private key, per-collection `K_epoch`s, and API keys live in `safeStorage.encryptString()` blobs under `userData/keys/`; the `SecretStore` port is the only way core touches them and core never sees a raw private key except transiently in `CryptoPort`. Rotation: new `K_epoch`, wrap for every remaining member, bump `collections.epoch`, and the UI states plainly in FR/EN that removal prevents **future** access only.

### 4.17 `Egress`

```ts
export type EgressPurpose = 'fetch'|'robots'|'robots-override'|'wayback'|'oembed'|'api'|'notion'
  | 'llm:anthropic'|'llm:google'|'embed:cloud'|'model-download'|'peer-send'|'peer-recv'|'update-check';
export interface EgressIntent { host: string; purpose: EgressPurpose; itemCount?: number;
  collectionId?: string; runId?: string; fields: EgressField[] }
export type EgressField = 'url'|'title'|'text'|'summary'|'note'|'tags'|'embeddings'|'snapshot'|'query';
export interface EgressPolicy { maxTextChars: number;            // default 2000
  allowedFields: EgressField[];                                  // default ['url','title','text']
  requireConfirmationFor: EgressField[];                         // ['note','tags','embeddings','snapshot']
  freeTierGoogleRestricted: boolean }                            // true → ['url','title'] only
export interface EgressSink { open(i: EgressIntent, scope: object): string;
                              close(id: string, r: { status; bytesIn; bytesOut; ms; error? }): void }
export function applyPolicy<T extends object>(payload: T, intent: EgressIntent, p: EgressPolicy):
  { payload: T; scope: object; blocked: EgressField[] };
export function withEgress<T>(sink: EgressSink, policy: EgressPolicy, intent: EgressIntent,
  run: (approved: { scope: object }) => Promise<{ value: T; bytesIn: number; bytesOut: number }>): Promise<T>;
```

`withEgress` opens the `egress_log` row *before* the call (status `pending`) and closes it after, so a crash mid-call leaves visible evidence. Every function in `main/net/` is already wrapped; firewall C guarantees nothing else can make a request. The free-tier Gemini gate is a policy flag, not a call-site check: if the user left the training-consent box unchecked, `allowedFields` for `llm:google` collapses to `['url','title']` and `applyPolicy` strips the rest — so a forgotten call site degrades rather than leaks.

### 4.18 `Exclusions`

```ts
export interface ExclusionRule { pattern: string;     // "example.com" | "*.example.com" | "10.0.0.0/8" | "localhost"
  category: 'banking'|'health'|'webmail'|'cloud'|'private'|'user'; reasonFr: string; reasonEn: string }
export interface ExclusionSet { defaults: ExclusionRule[]; user: ExclusionRule[]; allow: string[] }
export function compile(set: ExclusionSet): { matches(url: string): ExclusionRule | null };
export function explain(url: string, set: ExclusionSet): { blocked: boolean; rule?: ExclusionRule };
```

`resources/exclusions.default.json` ships the banking/health/webmail/cloud-drive/`localhost`/RFC1918/`*.local` list with bilingual reasons. `userData/exclusions.json` holds user additions and an `allow` list that unblocks a default. An excluded URL is still **saved** — title and URL only, `status='partial'`, `acquisition_method='og-only'`, with an explicit badge. It is never fetched and never sent to a cloud provider: the check sits in the router *and* in `withEgress`, because two independent checks is the right number for a rule whose failure is a privacy incident.

---

## 5. Data flows

### (a) Save a URL — the synchronous path, <2 s, zero LLM calls

| # | Step | Module | Note |
|---|---|---|---|
| 1 | Parse input lines | `importers/netscape` (paste path) | the ported `UrlInput` regexes |
| 2 | Normalise + hash | `url/normalize` | `stripUtmParams` port, widened |
| 3 | Dedupe against `bookmarks.url_hash` | `url/dedupe` | one `IN` query, not N |
| 4 | Exclusion check | `exclusions` | excluded → skip to 10 with `og-only` |
| 5 | `applyOp` create `bookmark` (`status='fetching'`) | `ops/applyOp` | row visible in the UI immediately |
| 6 | `acquire(url, {maxTier: 2})` | `acquisition/router` | tiers 0–2 only; tier 3 PDF if content-type says so. Tier 4 is **never** synchronous |
| 7 | Post-process | `acquisition/postprocess` | platform, thumbnail, confidence, date — the `legacy/server.ts` port |
| 8 | Detect language | `franc` over first 4 kB | → `bookmarks.lang` |
| 9 | Write `content_versions` + `bookmarks.current_version_id` | direct (derived table, not an op) | |
| 10 | Extractive lead: 3 sentences | `generation/extractive` | **no provider call — pure text** |
| 11 | Keyphrases | `clustering/extractKeyphrases` | embedding-only, MMR over n-grams |
| 12 | Chunk | `chunker` | ~450 tok / 60 overlap |
| 13 | Embed doc + chunks | `EmbeddingProvider` (CPU) | one batch; ~0.3 s for a typical page |
| 14 | Store 768-d BLOBs + project 256-d into `vec_docs` | `EmbeddingStore.put` | same transaction |
| 15 | FTS rows | triggers | automatic |
| 16 | Nearest theme + margin | `assignByCentroid` | margin < 0.02 → "À classer"; **additive, auto-applies** |
| 17 | `status='ready'`; enqueue `summarise` (priority 3) and, if tier ≤2 failed, `fetch` at tier 4 | `JobQueue` | |

Steps 6–14 dominate; measured budget on the reference laptop is ~1.1 s for an article, ~0.4 s for a YouTube shim. Step 17 is the only place generation is *mentioned*, and it enqueues a job id — the save path module has no import path to the provider (firewall B).

### (b) Background summary job

`jobs.kind='summarise'`, priority 3, window 22:00–07:00, nightly cap 300, paused on battery/thermal/typing. Handler: load `content_versions.text` → truncate to the provider's context budget (4K model → ~2,800 tokens of content) → `gen.generateObject({schema: SummarySchema})` → `schema.parse` → `applyOp` set `summary`, `summary_kind='llm'`, `summary_model_id`, plus AI tags as `bookmark_tags(source='ai', accepted=0)`. Selection order: starred, then `open_count ≥ 2`, then active collection, then newest — a single `ORDER BY` in the enqueue query, so the priority policy is one statement to audit. A cloud provider routes through `submitBatch` when >50 items are pending, and the run is priced in the UI before it starts.

### (c) "Reorganise my library" — one run

```
1  runs:start {kind:'reorganise'}         → runs row, status='running', plan shown first
2  buildKnnGraph(k=15)                    → knn_edges          [no LLM]   60–120 s @100k
3  louvainMultiResolution([0.4,1.0,2.0])  → communities        [no LLM]   <30 s
4  cTfIdf per cluster (FR+EN stopwords)   → top-8 terms        [no LLM]   ~10 s
5  labelClusters()                        → ClusterLabelSchema [LLM: one call per cluster]
6  dedupeSiblings()                       → merge/split hints  [LLM: one call per sibling set]
7  embed(label+description) → centroids   [no LLM]
8  assignByCentroid(margin 0.02)          → theme_assignments  [no LLM]   ~15 s
9  adjudicateTail(ambiguous)              → [LLM: 2–5 % of docs, capped at 500 calls]
10 materialiseTree() + matchThemes(old)   → tree diff, depth ≤4 [no LLM]
11 write run_items; runs.status='proposed'
12 Review queue → runs:decide → applyOp per accepted item, one transaction
13 runs:revert within 30 days → inverse ops, one transaction
```

**LLM call counts.** At 10k docs: r=0.4 ≈ 12 clusters, r=1.0 ≈ 90, r=2.0 ≈ 300 → 402 label calls + ~40 sibling calls + ≈ 250 tail adjudications (2.5 % of 10k) = **≈ 690 calls**. At 100k: ≈ 22 + 190 + 900 = 1,112 labels + ~200 sibling + 500 (tail, capped) = **≈ 1,812 calls**. At ~600 in / 200 out per call that is ~1.1 M in / 0.36 M out at 100k: on the 3050 at 40 tok/s ≈ 2.5 h; on Haiku Batches ≈ 1 h and ≈ 2 € — which is exactly the "propose the cloud" moment the Pragmatic authorises. Step 9's cap is what stops the tail from turning into a per-document run; overflow items simply stay "À classer" and appear in the review queue as a low-priority group.

### (d) Map render

1. `map:points` → main runs one query over `bookmarks` where `map_x IS NOT NULL`, writes three typed arrays (`ids` 16 B/row packed UUIDs, `xy` f32×2, `theme` u16) — ~2.6 MB at 100k — and transfers them.
2. Renderer builds a deck.gl `ScatterplotLayer` with `data: {length: n, attributes: {getPosition: {value: xy, size: 2}, getFillColor: …}}` — binary attributes, no per-row JS objects.
3. Colour from a 10-hue categorical scale indexed by `themes.color_idx`, `null` → grey "autre". Below zoom 3 the layer swaps to `HexagonLayer` over the same buffer.
4. Centroid labels render above zoom threshold from a separate ≤250-row query.
5. Lasso: a polygon drawn on a deck.gl overlay → point-in-polygon in a renderer Worker over the same `xy` buffer (no IPC) → `Uint32Array` of indices → mapped to ids.
6. `map:selectionStats` with the id list → one main-process query pack (count, c-TF-IDF over the selection's cached terms, top domains via `registrable`, a monthly histogram, top tags, confidence buckets) → the stats panel.
7. Timeline brush filters the same index set client-side and re-issues step 6.

### (e) Ask this selection

`ask:run` → `planAsk` (≤500 chunks → BM25 50 + vector 50 → RRF → top 6–8 → ≤3,000 tokens) → emit `passages` immediately (useful with no provider) → if a provider exists, stream tokens → on `done`, `parseCitations`; zero markers → one retry; still zero → badge. Every shown passage writes a `feedback_events('shown')` row and a click writes `('click')`, which is what feeds `rebuildAffinity`.

### (f) Export and import a bundle

**Export.** Pick collection + members → `writeBundle`: stream `EntityState` records from `op_frontier` ⋈ tables for the collection; stream `content_versions.text` for included bookmarks into `text.tar.zst`; stream 768-d BLOBs into `embeddings.f32` in record order; seal each segment under a fresh `K_epoch` nonce; wrap `K_epoch` per recipient X25519 pubkey; sign; write. One `egress_log` row per recipient with `purpose='peer-send'` even for a file handed over on a USB stick — the log is about *what left*, not about the network.

**Import on the friend's machine.** `readBundleHeader` → find a `recipients[].tag` matching `blake3(myPubkey ‖ collectionId ‖ epoch)` → unwrap `K_epoch` → verify the Ed25519 signature **before** decrypting any segment → stream records → `importBundle` runs `mergeEntity` per record in one transaction → embeddings are inserted with their `model_id` so the friend gets working semantic search **without running the model** → report `{newItems, updatedItems, conflicts}`. A conflict (both sides edited the same field) resolves by HLC and is *listed*, not hidden. Unknown signer → a confirmation naming the fingerprint before anything is written.

### (g) App start

```
1  single-instance lock; app.enableSandbox(); fuses asserted
2  open library.db → pragmas → backup if a migration will run → migrate() → PRAGMA user_version
3  load sqlite-vec extension; on failure set vec.degraded=true and fall back to BLOB brute force
4  probe hardware: getGPUInfo + nvidia-smi/os.totalmem → settings['hw.*']
5  probe providers: ollama → lmstudio → localpack → cloud key → extractive; result cached
6  model state machine: embedding model present? → else 'needed' (blocking for search, not for the UI)
7  create the main window; renderer boots and immediately calls app:info + providers:probe + settings:get
8  resume jobs: expire stale leases, requeue 'running' rows, start tick()
9  4 s later: updater.checkForUpdates()
```

Model download state machine: `absent → downloading → verifying(sha256 from models.manifest.json) → present`, with `failed(reason)` on any edge, resumable via HTTP Range, written to a `.part` file and renamed on success, progress on `models:progress`. The embedding model (~200 MB) downloads on first run; the app is fully usable meanwhile (import, browse, FTS search) and semantic features show a progress chip rather than an error.

### (h) Auto-update

`update:check` → `available` → renderer shows version + notes → user accepts → `downloadUpdate()` → `progress` events → `downloaded` → user accepts → `quitAndInstall()`. macOS only when `isPackaged` and Developer ID; otherwise `manual` + Releases URL (the artlux behaviour, kept as the fallback branch). One `egress_log` row with `purpose='update-check'` per check — the update feed is outbound traffic like any other and belongs on the screen.
---

## 6. Renderer architecture

### 6.1 Screens

| Screen | Route | Key components | Notes |
|---|---|---|---|
| Library | `/library` | `BookmarkTable` (TanStack Virtual), `FilterBar`, `BulkActionBar`, `BookmarkDrawer` | the ported list, now a table; row height fixed at 64 px so `estimateSize` is constant |
| Map | `/map` | `DeckMap`, `LassoOverlay`, `SelectionStats`, `Timeline` | **the demo screen** |
| Tree | `/tree` | `TreeOutline` (indented, collapsible, drag), `PinButton` | virtualised flat list, not a nested DOM |
| Review | `/review` | `RunList`, `RunDiff`, `DecisionBar`, `UndoBanner` | grouped by `run_items.group_key` |
| Ask | `/ask` (panel) | `AskInput`, `PassageList`, `AnswerStream`, `CitationChip` | opens over Map or Library with the current selection |
| Import | `/import` | `SourcePicker`, `ColumnMapper`, `DedupeReport`, `ImportProgress` | wizard: pick → map → preview → commit |
| Settings | `/settings` | `ProviderPanel`, `KeyField`, `ModelPanel`, `ExclusionEditor`, `LocalePicker` | |
| Egress | `/egress` | `EgressTable`, `EgressFilters`, `ExportCsvButton` | **top-level nav item**, not under Settings |
| Sharing | `/sharing` | `CollectionList`, `MemberList`, `BundleExport`, `BundleImport`, `IdentityCard` | |

### 6.2 State slices (Zustand)

```ts
useLibraryStore   // filters, sort, cursor, selectedIds:Set, page cache keyed by query hash
useSelectionStore // the ONE selection shared by Map ⟷ Library ⟷ Ask; {ids:Set, source:'lasso'|'table'|'theme'}
useMapStore       // typed-array buffers, viewState, hoveredIndex, colorScale, lassoPolygon
useTreeStore      // flat nodes, expanded:Set, dragState
useRunStore       // runs, active diff page, pending decisions (optimistic)
useJobStore       // queue state from jobs:state (≤2 Hz), throttle reasons
useSettingsStore  // settings + provider probe + hw
useAskStore       // askId, passages, streaming answer, citations
useToastStore
```

`useSelectionStore` being a single store is the architectural point: lassoing on the map and select-all in the table write the same `Set`, so "Ask this selection" and the stats panel never need to know which screen produced it.

### 6.3 Porting the old components into `packages/ui`

| From `legacy/` | To `packages/ui/src/` | Change |
|---|---|---|
| `BookmarkList.tsx` search/filter/sort state | `filters/useBookmarkFilters.ts` + `FilterBar.tsx` | state lifts to `useLibraryStore`; filtering moves **server-side** into `library:query` (100k rows cannot be filtered in JS). The platform pills with counts survive, fed by a `GROUP BY platform` in the same query. |
| `BookmarkItem.tsx` `EditableField` | `EditableField.tsx` | unchanged API; `onCommit` now dispatches `library:applyOps` instead of `setState` |
| `ConfidenceBadge` (≥85/≥60/<60 + reason tooltip) | `ConfidenceBadge.tsx` | thresholds to props with the same defaults; tooltip text comes from `content_versions.confidence_reason` |
| `PlatformBadge` (YouTube/Shorts/Playlist, Threads, X, GitHub, Article, Web) | `PlatformBadge.tsx` | add `pdf`; icons from the ported `Icons.tsx` |
| `BulkActionBar.tsx` | `BulkActionBar.tsx` | add remove-tags, move-to-collection, delete; bulk keyword append kept |
| `common/Icons.tsx` | `icons/` | keep; `lucide-react` is removed (two icon systems was the duplication the inventory flagged) |
| `common/Spinner.tsx` | `Spinner.tsx` | keep |
| `ExportButton.tsx` | deleted | exporters move to `packages/core/src/exporters` and the Export screen; the renderer no longer builds files |
| `SettingsModal.tsx` | deleted | proxy presets and X bearer flow discarded; model select survives as `ProviderPanel` |
| `NotionSyncModal.tsx` state machine | `import/NotionImportWizard.tsx` (v1.5) | the loading→select→syncing→complete shape is reused for *import* |

`packages/ui` components take data and callbacks only — no `window.cairn`, no `useTranslation()` initialisation, no Zustand imports. They receive `t` as a prop or via the `react-i18next` context that `apps/desktop` provides. That keeps the package renderable in Vitest + happy-dom and in a future PWA.

### 6.4 Tailwind, i18n, theming

Tailwind via PostCSS (`tailwind.config.ts` with `content` covering `apps/desktop/src/renderer` and `packages/ui/src`) — the CDN `<script>` and the `aistudiocdn.com` importmap in `legacy/index.html` are both deleted in P0.

i18n: `i18next` + `react-i18next`, namespaces `common | library | map | tree | review | ask | import | settings | egress | sharing | errors`, files at `apps/desktop/src/renderer/i18n/{fr,en}/<ns>.json`. FR is the source-of-truth locale (the user writes FR first); `en` is the fallback. Three enforcement layers: (1) an ESLint rule (`i18next/no-literal-string`) over `screens/` and `packages/ui/src/`, allowlisting class names, test ids and numbers; (2) a CI script asserting the FR and EN key sets are identical and no value is empty; (3) a pseudo-locale (`fr-PSEUDO`, every string wrapped and 40 % longer) behind a dev flag for truncation bugs. Bilingual *content* (theme labels, tag translations) is data, not i18n: `themes.label_fr/label_en` are columns, selected by `i18n.language`.

Theming: dark by default, as today. CSS custom properties on `:root` with a `[data-theme="light"]` override; Tailwind reads them through `theme.extend.colors` so components never hardcode a hex. deck.gl colours come from the same token set via a JS export so the map matches the chrome in both themes.

---

## 7. Packaging & release

### 7.1 `electron-builder.yml`

```yaml
appId: com.berenger.cairn
productName: Cairn
copyright: © 2026 Bérenger Recoules
directories: { output: ../../release, buildResources: build }
files: ["out/**/*", "!out/**/*.map"]
asar: true
asarUnpack: ["**/node_modules/better-sqlite3/**", "**/node_modules/onnxruntime-node/**", "**/*.node"]
electronFuses:
  runAsNode: false
  enableNodeCliInspectArguments: false
  onlyLoadAppFromAsar: true
  resetAdHocDarwinSignature: true      # artlux's tripwire lives on the other side of this
extraResources:
  - { from: resources/exclusions.default.json, to: exclusions.default.json }
  - { from: resources/models.manifest.json,    to: models.manifest.json }
  - { from: resources/stopwords.fr.json,       to: stopwords.fr.json }
  - { from: resources/stopwords.en.json,       to: stopwords.en.json }
publish: { provider: github, owner: b2renger, repo: AI-bookmark-manager }
artifactName: ${productName}-${version}-${os}-${arch}.${ext}
win:
  target: [{ target: nsis, arch: [x64] }, { target: zip, arch: [x64] }]
  icon: build/icon.ico
  signingHashAlgorithms: [sha256]         # certificateSubjectName set only once the OV token exists
nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true,
        include: build/installer.nsh }     # installer.nsh registers the cairn:// protocol handler
mac:
  target: [{ target: dmg, arch: [arm64] }, { target: zip, arch: [arm64] }]
  category: public.app-category.productivity
  icon: build/icon.icns
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  notarize: { teamId: "${env.APPLE_TEAM_ID}" }
linux:
  target: [AppImage, deb]
  category: Utility
  icon: build/icon.png
```

`entitlements.mac.plist` needs `com.apple.security.cs.allow-jit` and `allow-unsigned-executable-memory` (V8), plus `com.apple.security.cs.disable-library-validation` **only if** the local pack is loaded from `userData` — which it is, so it is required and documented as the reason. `darwin-x64` is a second `mac.target` arch added in CI only while it is one line; `@number0/iroh` has no darwin-x64 prebuild, so the P6 sharing screen feature-detects and hides direct transfer there, leaving file bundles (which is the v1 path anyway).

### 7.2 Native modules

| Module | Strategy |
|---|---|
| `better-sqlite3` 13 | prebuilds exist for Node but **not for Electron's ABI** → `electron-rebuild -f -w better-sqlite3` in the `package` script and in CI, cached by `~/.electron-gyp` + ABI key. `asarUnpack`ed. |
| `sqlite-vec` 0.1.9 | a loadable **extension** (`.dll/.dylib/.so`), not a native addon: shipped in `extraResources`, loaded with `db.loadExtension(path)`. No rebuild, no ABI coupling. A load failure sets `vec.degraded` and search falls back to BLOB brute force rather than failing. |
| `onnxruntime-node` 1.24 | ships prebuilt `.node` per platform/arch; `asarUnpack` + `files` filter to keep only the current platform's binaries (saves ~120 MB on Windows by dropping the CUDA provider we do not use). |
| `node-llama-cpp` 3.20 | **not in the installer** (§7.4). |
| `@number0/iroh` (P6) | napi prebuilds; no darwin-x64. |

CI runs `npm rebuild` on a matching Electron version per matrix leg; a mismatch surfaces as `NODE_MODULE_VERSION` at startup, so `main/db/open.ts` catches it and shows a bilingual "réinstallez l'application" dialog instead of a stack trace.

### 7.3 Model cache locations

| OS | Path |
|---|---|
| Windows | `%APPDATA%\Cairn\models\` (i.e. `app.getPath('userData')/models`) |
| macOS | `~/Library/Application Support/Cairn/models/` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/Cairn/models/` |

Layout: `models/embeddinggemma-300m-q8/{model.onnx,tokenizer.json,manifest.json}`, `models/gguf/<name>.gguf`, `models/localpack/<platform>-<arch>/`. A `manifest.json` per artefact records `{id, sha256, bytes, url, downloadedAt, license}`; the models directory survives uninstall by design and Settings offers "delete downloaded models" with the reclaimed size.

### 7.4 The optional local AI pack

Not in the installer (Pragmatic §4). `resources/models.manifest.json` lists, per `platform-arch`, a `node-llama-cpp` prebuilt bundle URL (Vulkan for win32/linux x64, Metal for darwin-arm64, CPU everywhere) with `sha256` and `bytes`. On first use of a local generation feature with no Ollama/LM Studio detected, the UI offers the download with the exact size. State machine as in §5(g); the archive extracts to `models/localpack/<platform>-<arch>/` and is loaded at runtime by the inference `utilityProcess` with an **absolute path computed from `app.getPath('userData')`, never from `asar`**. Refusal to run an unverified binary is explicit: a sha256 mismatch deletes the file and reports `failed('hash')`. Because the pack lives outside the bundle, macOS needs `disable-library-validation` (§7.1) and Windows SmartScreen never sees it (it is loaded, not executed as a separate `.exe` — which is precisely why this is better than a `llama-server` sidecar).

### 7.5 `verify:macsign`

Direct port of `artlux/scripts/verify-mac-signature.cjs`, with two changes: it scans `release/mac-arm64/` **and** `release/mac/`; and it additionally asserts the signature authority contains `Developer ID Application` (not just that it is valid), because an accidentally ad-hoc build now passes `codesign --verify` but fails notarization. It stays the last step of `npm run package`. The comment block explaining *why* (electron-builder flips fuses after `afterPack`, which silently invalidated every mac dmg from artlux v0.19.1 on) is carried over verbatim — it is the most expensive lesson in the sibling repo.

### 7.6 CI outline

```yaml
# .github/workflows/ci.yml       — push/PR
jobs:
  check:   { runs-on: ubuntu-latest, steps: [npm ci, lint, typecheck, test] }
  scale:   { if: schedule or label 'scale', steps: [fixture:gen --profile=scale, test:scale] }

# .github/workflows/release.yml  — on tag v*
strategy.matrix:
  - { os: windows-latest, args: "--win --x64" }
  - { os: macos-14,       args: "--mac --arm64" }
  - { os: macos-13,       args: "--mac --x64",  continue-on-error: true }   # Intel best-effort
  - { os: ubuntu-latest,  args: "--linux --x64" }
steps: npm ci → electron-rebuild → npm run build → verify-resources →
       electron-builder $args --publish always → verify:macsign (mac legs)
```

Secrets: `CSC_LINK` / `CSC_KEY_PASSWORD` (Windows OV, once bought — a hardware-token OV cannot sign in cloud CI, so the Windows leg publishes unsigned and a **local** signing step is documented in `docs/release.md`); `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` / `CSC_LINK` (Developer ID .p12) for macOS; `GH_TOKEN` for the Releases feed. The tag publishes `latest.yml`, `latest-mac.yml`, `latest-linux.yml` which `electron-updater` consumes.

---

## 8. Testing harness

### 8.1 Vitest projects

```ts
// vitest.workspace.ts
export default [
  { test: { name: 'core',  root: 'packages/core',      environment: 'node',
            setupFiles: ['test/setup.ts'], include: ['**/*.test.ts'] } },
  { test: { name: 'ui',    root: 'packages/ui',        environment: 'happy-dom' } },
  { test: { name: 'main',  root: 'apps/desktop',       environment: 'node',
            include: ['src/main/**/*.test.ts'] } },
  { test: { name: 'scale', root: 'packages/core',      environment: 'node',
            include: ['test/scale/**/*.test.ts'], testTimeout: 900_000, maxWorkers: 1 } },
];
```

`:memory:` fixture helper:

```ts
// packages/core/test/helpers/db.ts
export function testDb(opts?: { migrate?: boolean; vec?: boolean; seed?: number }): {
  db: DbHandle; ctx: OpContext; close(): void;
};
```

It opens better-sqlite3 `:memory:` (the *test* may import node — only `src/` is firewalled), runs `migrate()`, optionally loads sqlite-vec from `node_modules`, and builds an `OpContext` with a frozen `Clock` (`2026-01-01T00:00:00Z`, advanced by `clock.tick(ms)`) and a seeded `Random` (xoshiro128\*\*). Deterministic clock + random ⇒ deterministic UUIDv7, HLC and fractional indices ⇒ snapshot-testable op logs.

### 8.2 The 100k fixture generator — a P0 deliverable

`packages/core/scripts/genFixture.ts`, `npm run fixture:gen -- --profile=scale --seed=42 --out=.fixtures/library-100k.db`. Deterministic from the seed; **generated, not committed** (gitignored, CI caches by `hash(generator source + seed + profile)`).

| Dimension | Distribution |
|---|---|
| Count | `ci` 10k · `scale` 100k |
| Domains | Zipf(s=1.1) over 2,000 hosts; hand-seeded head: youtube.com, github.com, medium.com, arxiv.org, lemonde.fr, twitter.com, news.ycombinator.com, wikipedia.org, threads.net, substack.com |
| Platform | derived from the domain, matching the real detection ladder |
| Dates | 12-year span, exponential recency decay (half-life 18 months) + weekly seasonality (weekend dip) |
| Language | 45 % fr, 45 % en, 10 % other/mixed |
| Titles/summaries | Markov text from a 400-topic vocabulary (FR and EN word lists), so c-TF-IDF and FTS have real term statistics |
| Chunks | 4 per doc, ~600 chars each, in the `scale` profile only for a 10k "RAG subset" |
| Tags | 6,500 raw tags drawn from 900 canonical concepts, each spawning 1–9 near-duplicates: case variants, FR/EN pairs, singular/plural, hyphen↔space, accent-stripped. **`fixtures/tags-truth.json` maps raw → canonical**, which is the ground truth for the consolidation eval |
| **Embeddings** | **synthetic, no model required**: 400 topic centroids drawn uniformly on the 768-sphere, each doc = `normalize(centroid[t] + σ·gauss())` with σ ∈ [0.25, 0.55] per topic, plus 3 % uniform noise points. Louvain recovers ≈ 380–420 communities, so the clustering thresholds are exercised for real |

Sizes: `ci` ≈ 48 MB, `scale` ≈ 430 MB (100k × 3,072 B doc vectors = 307 MB dominates), generated in ~80 s on the reference laptop. A third profile `--profile=tiny` (200 docs, committed as `fixtures/library-tiny.db`, 1.2 MB) makes unit tests that need a populated DB fast and reviewable.

### 8.3 Perf assertions

`packages/core/test/scale/perf.test.ts`, thresholds in `test/scale/budgets.json` so rig numbers can update them in one reviewable diff:

```jsonc
{ "import100k_ms": 60000, "search_p95_ms": 150, "knn_build_ms": 120000,
  "louvain_ms": 30000, "map_first_paint_ms": 2000, "ask_plan_ms": 400,
  "bundle_export_10k_ms": 20000, "migrate_ms": 5000 }
```

Search p95 is measured over 200 queries drawn from the fixture vocabulary (half FR, half EN, a third with accents) after a warm-up of 20. Map first paint is asserted in the Playwright leg, not here. Every assertion prints the measured number even when it passes, so the CI log is a time series.

### 8.4 Playwright `_electron`

```
apps/desktop/e2e/
├─ fixtures.ts           launch({args:['out/main/index.js'], env:{CAIRN_USER_DATA: tmp, CAIRN_FIXTURE: …}})
├─ 00-boot.spec.ts       P0: window opens, title, no renderer error, DB migrated
├─ 01-import.spec.ts     P0: import a 500-line Netscape file → table shows 500 rows, dedupe report correct
├─ 02-search.spec.ts     P1: type a query → results < 500 ms, FR accent query matches
├─ 03-map.spec.ts        P2: open Map → first paint < 2 s → lasso 200 points → stats panel non-empty
├─ 04-acquisition.spec.ts P3: save a local fixture URL served by a test HTTP server → confidence badge
├─ 05-review.spec.ts     P4: start a reorganise on the tiny fixture with a stub provider → accept → undo
├─ 06-ask.spec.ts        P5: ask over a selection with no provider → passages render
└─ 07-bundle.spec.ts     P6: export a bundle, relaunch with a second userData, import, counts match
```

`CAIRN_USER_DATA` points at a temp dir per test (this is how the "cold start" case is exercised) and `CAIRN_FIXTURE` optionally seeds the DB. One scenario is added per phase, and the phase's rig checklist references the matching spec so manual and automated coverage stay aligned.

### 8.5 Golden extractor fixtures + canary

```
fixtures/extractors/<registrable-domain>/<sha256[0:12]>/
├─ page.html            raw bytes as fetched
├─ headers.json         {status, content-type, final-url}
└─ expected.json        {method, title, author?, publishedAt?, textHash, textLen,
                         firstChars, lastChars, lang, platform, confidence, confidenceReason}
```

~40 domains from the user's real corpus. `expected.json` stores a **hash plus the first/last 200 characters** rather than the whole text, so a fixture is reviewable in a diff. `scripts/canary.mjs` re-fetches the *live* URL for each fixture weekly in CI, runs the same extractor and reports drift **without failing the build** (extractor rot is expected; a red build every Tuesday teaches people to ignore red builds). It opens/updates one GitHub issue listing drifted domains.

### 8.6 AI eval harness

```
eval/
├─ urls.fr.json  urls.en.json      25 + 25 labelled URLs: {url, expect:{titleContains[], keywords[], platform, lang}}
├─ queries.json                    30 × {q, relevantIds[], scope}
├─ run.mjs                         --provider=ollama|anthropic|extractive --suite=extract|summary|search
└─ reports/<iso>-<provider>.json   {suite, model, metrics, perItem[]}
```

Metrics: extraction → `titleContains` pass rate, `keywordsOverlap ≥ 3`, platform exactness, language exactness. Search → **hit@5** and **MRR@10** over the 30 queries (the Pragmatic's reverse-if triggers at MRR@10 < 0.6). Summaries → an LLM judge: `claude-haiku-4-5` via **Batches**, scoring `{faithful, complete, concise, languageCorrect}` 1–5 with the source text in the prompt, one batch per run. A model or prompt change may not merge if any metric regresses by more than 3 points against the last accepted report; the accepted report is committed in `eval/reports/baseline.json`.

### 8.7 fast-check properties on the op log (from P6)

```ts
const opArb = fc.record({ entity: fc.constantFrom('bookmarks','tags','tree_nodes'), … });
fc.assert(fc.property(fc.array(opArb, {maxLength: 200}), fc.array(fc.nat(), …), (ops, order) => {
  // 1 convergence: two replicas applying the same op set in different orders agree field-by-field
  // 2 idempotence: applying the same op twice changes nothing (ix_ops_dedupe)
  // 3 monotonicity: every minted HLC is strictly greater than the previous
  // 4 undo: revert(run) restores the exact pre-run frontier for every touched field
  // 5 tree safety: no cycle, no orphan, no duplicate frac_index under one parent, depth ≤ 4
}), { seed: 42, numRuns: 500 });
```

Failing seeds are written to `packages/core/test/regressions/<seed>.json` and replayed as ordinary unit tests.

### 8.8 P9 CRDT convergence harness (sketch)

Three in-process replicas, each with its own `:memory:` DB and `LoroDoc`; a `SyncTransport` fake with `partition(a,b)`, `delay(ms)`, `drop(p)`, `reorder()`. Script: A offline for 50 ops, B offline for 50 ops, C online throughout, random reconnect order, then assert (a) all three `doc.toJSON()` are equal, (b) the SQLite projections are equal, (c) the tree has no cycles and every node is reachable, (d) no pinned node was lost. Fixed seeds; `regressions/` as above. This is the harness the P9 phase is *gated on*, not a nice-to-have.

---

## 9. Forward hooks for v2

### P8 — the MV3 extension

Already provisioned: tier 5 exists as a `Tier` interface slot with `accepts()` returning false in v1. What P8 adds is a **local capture endpoint** in main:

```ts
// apps/desktop/src/main/capture/server.ts  (P8)
// http.createServer on 127.0.0.1, ephemeral port written to userData/capture.json
// POST /capture  { secret, url, html, title, cookiesUsed:boolean }  → 202 + bookmarkId
// Shared secret: 32 random bytes generated at first run, stored in safeStorage,
// shown as a QR + copyable string in Settings → Extension.
// Requests are rate-limited and Origin-checked (chrome-extension://<id> only).
```

It plugs into `createRouter` as one more `Tier` with `tier: 5`, and into the queue as `jobs.kind='fetch'` with `payload.preferTier=5`. Nothing in §4.4 changes. The port file and the secret are already in the §3 `settings` table and the §4.17 egress purposes (`fetch`), so no schema migration.

### P9 — Loro

| Today | After P9 |
|---|---|
| `ops` = source of truth | `ops` = audit log; one `LoroDoc` per collection is the truth |
| `op_frontier` | deleted (Loro owns the frontier) |
| `applyOp` body steps 2–6 | `doc.getMap(entity).set(field, value)`; `tree_nodes` → `doc.getTree('tree').move(node, parent, index)` |
| `applyOp` step 7 (projection) | driven by `doc.subscribe(ev => project(ev))` instead of inline |
| `mergeEntity()` | `doc.import(bytes)` |
| bundle `mode:'state'` | `doc.export({mode:'shallow'})` — the same shape, so `.bkmshare` v1 files still import |
| HLC string | Loro's `(peerId, counter)`; the actor is already embedded in the HLC so no identity change |

Everything **derived** stays derived and needs no migration: `content_versions`, `chunks`, `embeddings`, `vec_*`, `knn_edges`, `*_fts`, `search_affinity`, `jobs`, `egress_log`, `feedback_events`, `runs`/`run_items`. Migration is: for each collection, create a fresh doc, replay the current frontier as one Loro transaction, snapshot, done — cheap precisely because v1 has no concurrent history to preserve.

Transport interface, defined in P6 and implemented by iroh in P9:

```ts
export interface SyncTransport {
  readonly id: 'file'|'iroh'|'trystero'|'fake';
  connect(peer: PeerAddr): Promise<SyncSession>;
  listen(onSession: (s: SyncSession) => void): () => void;
  status(): { state: 'direct'|'relayed'|'offline'; relay?: string };
}
export interface SyncSession {
  send(collectionId: string, bytes: Uint8Array): Promise<void>;
  onReceive(cb: (collectionId: string, bytes: Uint8Array) => void): () => void;
  close(): void;
}
```

The v1 "file bundle" path implements `SyncTransport` with `id:'file'` (connect = pick a file), which is what lets the P6 sharing UI and the P8/P9 tests share one code path — and what the fake transport in §8.8 substitutes for.

### P10 — usearch, reranker, MCP

```ts
export interface VectorIndex {                 // defined in P1, implemented twice
  readonly dim: number; readonly modelId: string;
  add(ids: string[], vecs: Float32Array): Promise<void>;
  remove(ids: string[]): Promise<void>;
  search(q: Float32Array, k: number, filter?: (id: string) => boolean): Promise<{ id: string; score: number }[]>;
  size(): number; persist(): Promise<void>;
}
// v1:  SqliteVecIndex (doc level, exact) + BlobBruteForceIndex (scoped chunks)
// P10: UsearchIndex (global chunk HNSW, view() mmap) — a third implementation, zero call-site changes
export interface Reranker { rerank(q: string, cands: { id: string; text: string }[], topK: number):
  Promise<{ id: string; score: number }[]> }
// Search takes `reranker?: Reranker`; v1 passes undefined and the RRF result is returned unchanged.
```

MCP lands as a thin stdio wrapper over a **transport-agnostic query service** that is already the implementation behind the `search:*`, `library:query`, `tree:query` and `ask:run` IPC handlers:

```ts
export interface QueryService {              // main/query/service.ts, defined in P1
  search(q, scope, opts): Promise<SearchResult>;
  get(id): Promise<BookmarkDetail>;
  list(filters): Promise<Page<BookmarkRow>>;
  tree(q, scope): Promise<TreeNode[]>;
  ask(q, scope): AsyncIterable<AskEvent>;
  // P10 writes: addBookmark, addTag, pinBranch — each goes through applyOp like any other caller
}
```

The IPC handlers are one-line adapters over it; the MCP server is another. Nothing in §4 or §6 changes.

---

## 10. Open technical questions

| # | Question | My default |
|---|---|---|
| 1 | `vec_docs` stores 256-d for 100k docs but chunk vectors are brute-forced from BLOBs. If a selection is 5,000 bookmarks × 8 chunks = 40k chunk vectors, is 768-d brute force still <150 ms? | **Cap `AskSelection` candidate chunks at 500 *before* retrieval by pre-ranking bookmarks with the doc-level index**, so the brute force is always ≤500 × 768. If rig tests show the doc pre-rank hurts recall, add a 256-d `vec_chunks` table for the RAG subset only, still no usearch. |
| 2 | `graphology` at 100k nodes / 1.5M edges needs ~250 MB. Main process or layout `utilityProcess`? | **Layout `utilityProcess`.** Main owns the DB and must stay responsive; an OOM there loses the library. Cost: the community assignment crosses a message boundary (100k × 3 u32 = 1.2 MB, transferable). |
| 3 | FTS5 `remove_diacritics 2` folds at index time, so a French user searching `"resume"` finds `"résumé"` — but so does a user searching `"cote"` for `"côté"`. Acceptable? | **Yes, fold.** French search without folding is worse than French search with over-matching, and BM25 plus the vector leg re-ranks the noise down. Revisit only if the eval harness shows precision@5 dropping. |
| 4 | `summary_kind='llm'` overwrites the extractive lead in place. Should the extractive one be kept? | **Keep both**: the extractive lead moves to `content_versions` (it is derived from that text anyway) and `bookmarks.summary` holds the best available. Costs one column, buys a correct revert when an LLM summary is rejected. |
| 5 | Snapshot GC is LRU at 5 GB, but a snapshot referenced by an exported bundle may be needed again. | **Refcount, don't just LRU**: `snapshots.ref_count` incremented per referencing `content_versions` row; GC only evicts `ref_count = 0` entries, then LRU within those. A bundle export does not pin (the bytes already left). |
| 6 | The 30-day undo window keeps `ops.inverse` JSON for every field of every run. At 100k docs a full reorganise is ~300k inverse values. Storage? | **≈ 60 MB, keep it.** Vacuum `inverse` (set to NULL) on runs past `expires_at` in the same nightly job that expires them; the op stays, only the undo payload goes. |
| 7 | Two sqlite connections (main read-write, layout read-only) under WAL: the layout process can read a snapshot mid-import and compute a layout for a stale set. | **Stamp `map_run_id`** and refuse to write positions whose run is no longer current. The map shows "positions from <date>" and offers recompute; a stale layout is a UI fact, not a correctness bug. |
| 8 | Should `packages/ui` own i18n, or receive `t` as a prop? | **Receive `t`.** It keeps `packages/ui` initialisation-free and testable, at the cost of prop noise on leaf components. If the noise becomes unbearable, add a `UiI18nContext` inside `packages/ui` with an identity-function default — still no `i18next` dependency in the package. |
