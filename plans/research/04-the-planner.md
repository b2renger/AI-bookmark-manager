# The Planner — Phased Implementation Plan (P0–P10)

**2026-09-12.** Executes The Pragmatic's decision record without deviation: phase order from §16, scope from §16, testing layers from §17, handoff invariants from the handoff notes. Durations are working days for one solo developer, and **include** the phase's own rig-test day but **not** the fix-and-retest loop it may trigger. Branch names follow decision 14. Deliverable names are deliberately coarse — The Builder refines the APIs.

Reading order for anyone executing this: `plans/SEQUENCING.md` first, then the phase file, then the rig-test record from the previous phase (its numbers may have changed a default).

---

## P0 — foundation

**Branch** `v2/p0-foundation` · **Duration** 12–18 days · **Depends on** nothing (cut from `v2-local-first`, itself cut from `main`)

**Goal.** Turn the AI Studio SPA into an Electron workspace monorepo with a real SQLite schema, the `applyOp` mutation layer, the importer set, and FR/EN i18n from the first screen. Every later phase is a feature bolted to this skeleton, so nothing here may be "provisional".

**The one thing that must be true at the end.** A throwaway unsigned installer, installed on both rigs, imports the user's real Netscape export *and* opens `fixtures/100k.db`, lists 100,000 rows in a virtualised table, and full-text searches them — in French, with diacritics folded.

### Deliverables

- `apps/desktop/` — electron-vite 5 + electron-builder 26 scaffold, `src/main | src/preload | src/renderer`, `contextIsolation` on, `sandbox` on, `nodeIntegration` off, narrow `contextBridge`.
- `packages/core/src/schema/` — migration runner + schema v1 (the 17 entities of decision 8).
- `packages/core/src/ops/` — `applyOp`, HLC clock, actor identity placeholder, `ops` table writer.
- `packages/core/src/ids/` — UUIDv7, fractional index helpers.
- `packages/core/src/url/` — normalisation + dedupe.
- `packages/core/src/import/` — netscape, chromium, firefox, raindrop, karakeep, pocket, csv-mapper.
- `packages/core/src/export/` — `bookmarks.json` round-trip (the contract).
- `packages/core/src/i18n/` + `locales/{fr,en}.json`.
- `packages/ui/` — ported presentational components.
- `apps/desktop/src/renderer/screens/` — `LibraryTable`, `ImportWizard`, `SettingsScreen`.
- `apps/extension/` — placeholder package only (built in P8).
- `tools/fixture-gen/` → `fixtures/100k.db`.
- `plans/SEQUENCING.md`, `plans/p0-foundation.md`, `plans/rig-tests/TEMPLATE.md`.
- `.github/workflows/ci.yml`, `docs/SECURITY.md`.

### Ordered tasks

1. First commit: add `.env` to `.gitignore`, rotate the Gemini key, remove the `vite.config.ts` key `define`, delete the 14 `test-*` files, `ApiKeySetup.tsx`, the duplicate root `Header.tsx`, `bun.lock`, `.idx/` — verify `rg "AIza" -- .` returns 0 and the rotation is noted in `docs/SECURITY.md`.
2. Cut `v2-local-first`; create npm workspaces (Node 24 / npm 11); move the current app to `legacy/` untouched — `npm run build` green across all workspaces.
3. Scaffold `apps/desktop` from the artlux pattern [port: `artlux/electron.vite.config.ts`, `artlux/src/main/index.ts`] — `npm run dev` opens a window with renderer HMR.
4. ESLint `no-restricted-imports` banning `node:*` and `electron` inside `packages/core` — `core-purity.test.ts` fails on a deliberate `import fs from 'node:fs'`.
5. better-sqlite3 bootstrap with the decision-8 pragmas (WAL, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`, `mmap_size=268435456`) + migration runner — `migrations.test.ts` applies up and down on `:memory:`.
6. Schema v1: all entities, UUIDv7 PKs, `collection_id` on every shareable row, `tree_nodes.frac_index`, `ops` and `runs` first-class — `schema.test.ts` asserts zero `AUTOINCREMENT` and `collection_id` present on every shareable table.
7. `applyOp(op)` with `(actor_pubkey, hlc, entity, field, value)` and per-field LWW; no feature code may `UPDATE` directly — `applyOp.test.ts` shows shuffled op order converges to the higher HLC; `no-direct-update.test.ts` greps the repo for raw `UPDATE` outside `ops/`.
8. FTS5 external-content tables + triggers, `unicode61 remove_diacritics 2`, query-side FR stem map — `fts.test.ts`: "café" ↔ "cafe" match both directions.
9. Netscape importer, folders → tags [port: `components/UrlInput.tsx#handleSubmit`] — `netscape.test.ts` on a 5k-entry fixture: count, `ADD_DATE` → ISO, folder path → tag path.
10. URL normalisation + dedupe [port: `App.tsx#stripUtmParams`, `App.tsx#handleProcessUrls`] — `normalise.test.ts` covers 20 UTM / fragment / trailing-slash / punycode cases.
11. Chromium live-JSON and Firefox `places.sqlite` importers, copy-then-read — manual check against real profiles on both rigs, no path prompt on the default install.
12. Generic CSV/JSON column mapper + mapper UI, with Raindrop / Karakeep / Pocket as thin adapters over it — `mapper.test.ts` maps a 6-column CSV to the canonical shape; each adapter has one fixture.
13. Import inside one `db.transaction()` with a dedupe report rendered *before* commit — 100k import < 60 s on the Windows rig (CI perf assertion).
14. Virtualised library table with search / platform filter / sort [port: `BookmarkList.tsx`] plus `EditableField`, `ConfidenceBadge`, `PlatformBadge`, `BulkActionBar`, `Icons` into `packages/ui` — 100k rows scroll at ≥ 50 fps.
15. i18next + react-i18next wiring, FR default, EN parity; `i18n-lint` script — CI fails on one deliberately hardcoded string.
16. `tools/fixture-gen`: 100k bookmarks with realistic domain / date / tag / language distributions, chunk placeholders, fixed seed — regenerating with the same seed produces an identical `text_hash` set.
17. `bookmarks.json` export + re-import round trip [port: `components/ExportButton.tsx`] — `roundtrip.test.ts`: `import(export(db))` equals `db` by content hash.
18. Playwright `_electron` smoke #1 — launch, import a 200-link HTML file, assert row count; green in CI and on both rigs.
19. Unsigned NSIS + portable ZIP + dmg + AppImage build, installed on both rigs — installer size and first-launch time recorded.
20. Delete `legacy/`; write `plans/SEQUENCING.md` and `plans/p0-foundation.md` — `rg "legacy/"` returns 0 hits outside git history.

### Automated tests added

Vitest over `packages/core` with `:memory:` SQLite per test (schema, ops, importers, normalise, FTS, round-trip). **The 100k fixture DB ships here** with weekly CI perf assertions (import < 60 s, p95 FTS < 150 ms). Playwright `_electron` smoke #1. i18n hardcoded-string lint. `core-purity` and `no-direct-update` guard tests.

### Human rig test — P0

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Notes |
|---|---|---|---|---|---|
| 1 | **COLD:** wipe `userData`, install the unsigned build, launch to an empty library | Window paints, zero console errors, no crash dialog | installer ___ MB · launch→interactive ___ s | installer ___ MB · launch→interactive ___ s | |
| 2 | Import the user's real Netscape export | Dedupe report shown before commit; committed count equals report | ___ links · ___ s · ___ dupes | ___ links · ___ s · ___ dupes | |
| 3 | Import live Chrome/Edge bookmarks | Profile auto-found, no manual path entry | ___ links · ___ s | ___ links · ___ s | |
| 4 | **SCALE:** open `fixtures/100k.db` | Table reports exactly 100,000 rows | open→first row ___ s · RSS ___ MB | open→first row ___ s · RSS ___ MB | |
| 5 | **SCALE:** scroll the 100k table continuously for 10 s | No blank rows, no scroll stall | ___ fps sustained · RSS after ___ MB | ___ fps sustained · RSS after ___ MB | |
| 6 | Search `café` then `cafe` over 100k | Both queries return the same hit set | p95 of 20 queries ___ ms | p95 of 20 queries ___ ms | |
| 7 | **FAILURE:** import a truncated / malformed Netscape file | Named bilingual error, transaction rolled back, app alive | rows committed ___ (must be 0) · recovery ___ s | rows committed ___ (must be 0) · recovery ___ s | |
| 8 | **FAILURE:** force-kill the app mid-import, relaunch | DB opens, WAL recovered, no partial rows | relaunch ___ s · row count ___ | relaunch ___ s · row count ___ | |
| 9 | Switch UI language FR ↔ EN on Library / Import / Settings | No untranslated or clipped string | untranslated strings ___ | untranslated strings ___ | |
| 10 | Export everything, re-import into a fresh `userData` | Row count and content hash equal | export ___ s · file ___ MB · row delta ___ | export ___ s · file ___ MB · row delta ___ | |

**Sign-off:** date ______ · tester ______ · **go / no-go** ______

**Numbers feed back into:** step 4–6 (100k open, scroll fps, FTS p95) confirm or break decision 8's "no ANN index needed at doc level" and set the P2 map frame budget; step 1 installer size sets the baseline the P4 local-AI-pack download must be measured against; step 5 RSS sets the memory ceiling P9's Loro doc must fit under.

### Exit criteria

- Unsigned installers built and installed on both rigs; app launches from a cold `userData`.
- Schema v1 migrated up and down; every mutation in the codebase routed through `applyOp`; `ops` rows written.
- All seven importers plus the CSV mapper land in one transaction with a pre-commit dedupe report.
- `fixtures/100k.db` committed (or generated by a committed seed) and the weekly perf job green.
- FR and EN complete on Library / Import / Settings; i18n lint in CI.
- `legacy/` deleted.

### What could go wrong

- **Native-module prebuild matrix** (better-sqlite3 across win-x64 / mac-arm64 / mac-x64 / linux-x64) eats days under electron-vite. *Fallback:* decision 14's reverse-if — collapse to one package with `src/core` and keep the import discipline as a lint rule.
- **The 100k fixture is unrealistic** (uniform domains, synthetic text) and flatters every later number. *Fallback:* seed the distributions from the user's real export before generating, and re-record P0 numbers once real text arrives in P3.
- **The op-log layer feels like ceremony** and gets bypassed "just this once" in an importer. *Fallback:* the `no-direct-update` grep test is CI-blocking, not advisory.
- **The Gemini key is already in git history.** *Fallback:* rotation is task 1 and non-negotiable; history rewriting is optional, rotation is not.

---

## P1 — embeddings and hybrid search

**Branch** `v2/p1-embeddings-search` · **Duration** 8–12 days · **Depends on** P0

**Goal.** Make the universal substrate exist: EmbeddingGemma-300M ONNX q8 fetched on first run, doc and chunk embeddings stored 768-d as BLOB and indexed at 256-d in sqlite-vec, hybrid FTS5 + vector retrieval fused with RRF. No generation anywhere — the save path is sealed against it in code.

**The one thing that must be true at the end.** Type a French query, get semantically relevant English results out of 100,000 links, p95 under 150 ms, with zero LLM calls and zero network.

### Deliverables

- `packages/core/src/embed/` — `EmbeddingProvider` interface, model registry (`model_id`, `dim`), Matryoshka truncate + re-normalise.
- `apps/desktop/src/main/embedProcess.ts` — `utilityProcess` host; `ModelDownloadDialog.tsx`.
- `packages/core/src/chunk/` — structure-aware chunker (h1–h3, ~450 tokens, 60 overlap, never crossing a heading).
- `packages/core/src/vec/` — sqlite-vec loader + a single `VectorIndex` interface (usearch will implement it in P10).
- `packages/core/src/search/` — `bm25`, `vecSearch`, `rrf`, `boosts`, `feedback`.
- `packages/core/src/savepath/` — the sealed synchronous save path.
- `packages/core/src/jobs/` — pausable, throttled queue; `packages/ui/src/jobs/JobsPanel.tsx`.
- `apps/desktop/src/renderer/screens/SearchScreen.tsx`.
- `fixtures/eval/queries-30.json`.

### Ordered tasks

1. Bundle `onnxruntime-node`; probe available execution providers at startup and persist the result into `settings` — `runtime.test.ts` asserts the CPU EP is always present.
2. Model registry + resumable first-run download of `onnx-community/embeddinggemma-300m-ONNX` q8 with a progress dialog — manual: drop the network once mid-stream, download resumes and the checksum verifies.
3. `EmbeddingProvider.embed(texts[])` running in a `utilityProcess`, batched with back-pressure — `embed.test.ts`: cosine(self) = 1, a known FR/EN pair ranks above a known unrelated pair.
4. Store the full 768-d vector as BLOB in `embeddings` with `model_id` and `dim`; index the truncated, re-normalised 256-d in `vec_docs` — `matryoshka.test.ts` asserts ‖v256‖ = 1 and recall@10 within 5 points of 768-d on a 2,000-doc labelled subset.
5. Structure-aware chunker — `chunk.test.ts`: no chunk crosses a heading; `(charStart, charEnd)` round-trips to the source text exactly.
6. Per-bookmark language detection (`franc`) stored on `content_versions` — `lang.test.ts`: ≥ 95% correct on 40 FR/EN samples.
7. KeyBERT-style embedding keyphrases (FR+EN stopwords, MMR diversify to 5) — `keyphrase.test.ts`: ≥ 3 of 5 overlap with labels on 20 hand-labelled docs.
8. Extractive 3-sentence lead — `lead.test.ts`: never empty, never more than 3 sentences.
9. **Save-path invariant:** `packages/core/src/savepath/` may not import `packages/core/src/generate/`; enforced by ESLint `no-restricted-imports` plus a test — `savepath-purity.test.ts` fails on a deliberate import, and the whole save path completes < 2 s per item.
10. Background job queue: per-job progress, pause/resume, auto-pause on battery, thermal pressure and active typing — `jobs.test.ts`: pause/resume preserves exactly-once semantics.
11. Backfill run over `fixtures/100k.db` doc embeddings — throughput recorded in chunks/s; asserted to project under 12 h wall-clock on the Windows rig.
12. Retrieval: FTS5 BM25 (k=50) + sqlite-vec exact (k=50) → RRF(k=60) → top 30 — `rrf.test.ts` on a fixed ranking fixture.
13. Post-RRF boosts (recency decay, domain affinity, tag affinity, open count) behind a settings flag — `boosts.test.ts` asserts monotonicity and bounded influence.
14. `feedback_events` logging `(query, shown, clicked, dwell)` — `feedback.test.ts`: rows written, nothing beyond local ids stored.
15. SearchScreen: one box, mode toggle (texte / sémantique / hybride), per-result score breakdown, FR/EN — manual on both locales.
16. Seed `fixtures/eval/queries-30.json` (30 `(query, relevantIds)` pairs over the real corpus) and record the hit@5 / MRR@10 baseline into `plans/p1-embeddings-search.md` — `npm run eval:retrieval` prints the pair.
17. Playwright smoke #2 — import → wait for the embed queue to drain → semantic search returns ≥ 1 result.

### Automated tests added

Matryoshka recall test (gates decision 5's reverse-if). Embedding throughput assertion on the 100k fixture. Search p95 < 150 ms perf assertion. Save-path purity guard. Smoke #2. The **retrieval half** of the AI eval harness is seeded here; the generation half arrives in P4.

### Human rig test — P1

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Notes |
|---|---|---|---|---|---|
| 1 | **COLD:** fresh `userData`, no models — launch and accept the model download | Progress bar advances, checksum verified, app usable meanwhile | download ___ s · ___ MB · peak RSS ___ MB | download ___ s · ___ MB · peak RSS ___ MB | |
| 2 | Embed 1,000 real bookmarks with the queue visible | Queue drains, no dropped items | ___ chunks/s · CPU ___ % · package ___ °C | ___ chunks/s · CPU ___ % · package ___ °C | |
| 3 | Unplug the charger mid-run (or enable low-power mode) | Queue auto-pauses and says why, in the UI locale | pause latency ___ s | pause latency ___ s | |
| 4 | **SCALE:** run the doc-embedding backfill over `fixtures/100k.db` for 15 minutes, extrapolate | Sustained rate within 20% of the 1k-run rate | ___ chunks/s · projected full run ___ h | ___ chunks/s · projected full run ___ h | |
| 5 | **SCALE:** 20 hybrid searches over 100k | Every query returns, none times out | p95 ___ ms · max ___ ms | p95 ___ ms · max ___ ms | |
| 6 | Ask a French query expected to hit English documents | ≥ 3 of the top 10 are the expected cross-language hits | hits ___ /10 | hits ___ /10 | |
| 7 | Run `npm run eval:retrieval` on the real corpus | Baseline recorded, no crash | hit@5 ___ · MRR@10 ___ | hit@5 ___ · MRR@10 ___ | |
| 8 | Toggle the index between 256-d and 768-d and re-run step 7 | Both complete; delta recorded | Δ MRR@10 ___ · vec RAM 256 ___ MB / 768 ___ MB | Δ MRR@10 ___ · vec RAM 256 ___ MB / 768 ___ MB | Gates decision 5 |
| 9 | **FAILURE:** turn the network off, then delete the model file and restart | Clear bilingual "model missing / offline" state; FTS-only search still works | text-search p95 ___ ms · time to clear error ___ s | text-search p95 ___ ms · time to clear error ___ s | |
| 10 | **FAILURE:** corrupt 1 KB of the model file, restart | Checksum rejects it and offers re-download, no crash | detect ___ s | detect ___ s | |

**Sign-off:** date ______ · tester ______ · **go / no-go** ______

**Numbers feed back into:** step 2/4 embedding throughput sets the AI budget caps of decision 5 (nightly queue size) and the honest first-run wait quoted in the P7 onboarding copy; step 8's Δ MRR@10 fires or clears decision 5's reverse-if (flip the index to 768-d); step 5 p95 confirms decision 8's "usearch deferred".

### Exit criteria

- Model downloads, verifies and resumes; app remains usable during the download.
- 768-d stored / 256-d indexed with `model_id` and `dim` on every row; recall delta measured and inside the 5-point band.
- Hybrid search p95 < 150 ms at 100k on both rigs.
- Save path completes < 2 s per item and is provably unable to reach a generation provider.
- Job queue pauses on battery and thermal; retrieval eval baseline recorded in `plans/`.

### What could go wrong

- **EmbeddingGemma on CPU is far slower than the estimate** (the Doubtful cites ~4 chunks/s for a badly-shipped build). *Fallback:* switch the registry default to `nomic-embed-text-v2-moe`, or re-quantise; the `model_id` stamp makes this a reindex of new rows, not a corpus-wide re-embed.
- **Matryoshka truncation costs more recall than predicted.** *Fallback:* flip the index to 768-d — a reindex, not a re-embed, which is exactly why decision 5 stores the full vector.
- **sqlite-vec loading fails inside the packaged app** (extension path vs asar). *Fallback:* unpack the extension via `asarUnpack` and assert the load in the smoke test, not only in dev.
- **The download dialog is blocked by antivirus / proxy on a friend's machine.** *Fallback:* this is the first of the two rig failures that fire decision 4's reverse-if; record it.

---

## P2 — clustering, map and statistics (**the demo**)

**Branch** `v2/p2-map-demo` · **Duration** 10–15 days · **Depends on** P1

**Goal.** Build the wedge: kNN graph → multi-resolution Louvain → c-TF-IDF terms → landmark-UMAP positions → a deck.gl map with lasso selection, a statistics panel, a timeline brush and an indented tree outline. No LLM — labels are placeholder c-TF-IDF terms until P4.

**The one thing that must be true at the end.** The screenshot exists: a deck.gl scatterplot of ~10,000 of the user's own imported bookmarks, coloured by auto-generated theme, with an active lasso selection and a statistics panel showing that selection's top terms, top domains and date histogram.

### Deliverables

- `packages/core/src/cluster/` — `knnGraph`, `louvain` (multi-resolution, seeded), `ctfidf`, `assign`.
- `packages/core/src/layout/` — landmark UMAP (fit on a stratified 8–10k sample, place the rest by inverse-distance over 10 nearest landmarks).
- `apps/desktop/src/renderer/workers/layout.worker.ts`.
- `packages/ui/src/map/MapView.tsx` — ScatterplotLayer + HexagonLayer + GPU picking + lasso.
- `packages/ui/src/stats/SelectionStats.tsx`.
- `packages/ui/src/timeline/TimelineBrush.tsx` (Observable Plot).
- `packages/ui/src/tree/TreeOutline.tsx` (read-only in this phase).
- `packages/core/src/runs/` — run + diff scaffolding (the undo unit, built before the first clustering write).
- `docs/demo/` — the screenshot and its capture script.

### Ordered tasks

1. `runs` + diff scaffolding first: every clustering write belongs to a `run_id` and produces a diff; only additive, reversible auto-apply is permitted — `runs.test.ts`: undo of a synthetic run reverts atomically.
2. Cosine kNN graph, k=15, over `vec_docs`, cached in a `knn_edges` table with incremental top-up — 100k build < 120 s on the Windows rig (CI perf assertion).
3. graphology + `graphology-communities-louvain` at r = 0.4 / 1.0 / 2.0, fixed seed — `louvain.test.ts`: same seed → identical partition; < 30 s at 100k.
4. c-TF-IDF per cluster with FR + EN stopwords and diacritic folding — `ctfidf.test.ts`: expected top terms on a synthetic 3-topic corpus, and on a mixed-language cluster.
5. Placeholder bilingual labels from the top 2 c-TF-IDF terms, stored on `themes` with `run_id`, `resolution`, `centroid`, `parent_id` — `themes.test.ts`: depth ≤ 4, every node grounded in a real cluster.
6. Zero-LLM centroid assignment with a margin threshold; low-margin docs land in "À classer / Unsorted" — `assign.test.ts`: margin behaviour and the tail size (expect 2–5%).
7. Landmark UMAP in a Worker, `x,y` persisted to SQLite, seeded and deterministic — 100k layout < 8 min; `layout.test.ts` same seed → identical coordinates.
8. deck.gl `ScatterplotLayer` with GPU picking, ≤ 10 theme hues + "autre" — 100k points ≥ 60 fps on the Windows rig; `regl-scatterplot` fallback wired behind a flag but unused.
9. `HexagonLayer` below a zoom threshold; centroid labels only above it — manual: no more than 2 overlapping labels at any zoom.
10. Lasso selection producing a selection id shared with the table and the tree — `selection.test.ts`: point-in-polygon over a 1,000-point fixture matches a brute-force reference.
11. Selection statistics: count, top c-TF-IDF terms, top domains, date histogram, top tags, confidence distribution — computed < 300 ms for a 10,000-item selection.
12. Observable Plot timeline with a brush that filters the map — manual: brush ∩ lasso composes as an intersection, and clearing one keeps the other.
13. Indented collapsible tree outline over the persistent theme hierarchy, read-only — renders 1,200 leaves without jank (Canvas past ~2k nodes).
14. Query-time disposable tree: `tree(query)` over the top N ≤ 500 results from cached labels, never persisted — < 300 ms, zero LLM calls.
15. Cross-highlight between map, table and tree — manual: selecting in any one highlights in the other two.
16. Capture the demo screenshot into `docs/demo/` and link it from `plans/p2-map-demo.md` — the image matches the decision-16 description exactly.
17. Playwright smoke #3 — import → cluster → lasso → stats panel shows a non-zero count and ≥ 3 terms.

### Automated tests added

Louvain and layout determinism tests. Perf assertions on the 100k fixture: kNN build < 120 s, Louvain < 30 s, map first paint < 2 s. `runs` undo test (the scaffolding P4 depends on). Smoke #3.

### Human rig test — P2

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Notes |
|---|---|---|---|---|---|
| 1 | **COLD:** fresh `userData` → import the real export → embed → cluster → map, unattended | End-to-end completes with no manual step after "start" | total ___ min · peak RSS ___ MB | total ___ min · peak RSS ___ MB | |
| 2 | Inspect the r = 1.0 themes against your own knowledge of the corpus | ≥ 70% of the 20 largest themes are recognisable as real topics | recognisable ___ /20 | recognisable ___ /20 | Subjective but counted |
| 3 | **SCALE:** build the kNN graph and run Louvain over `fixtures/100k.db` | Both complete inside the budget | kNN ___ s · Louvain ___ s · themes r1.0 ___ | kNN ___ s · Louvain ___ s · themes r1.0 ___ | |
| 4 | **SCALE:** compute the landmark layout for 100k | Deterministic; no worker crash | layout ___ min · worker peak RSS ___ MB | layout ___ min · worker peak RSS ___ MB | |
| 5 | **SCALE:** render 100k points, pan and zoom for 30 s | No dropped frames visible, picking still accurate | ___ fps · GPU ___ MB VRAM · GPU ___ °C | ___ fps · GPU ___ MB · GPU ___ °C | |
| 6 | Lasso ~10,000 points, read the stats panel | Panel populated in under a second | stats ___ ms · terms shown ___ | stats ___ ms · terms shown ___ | |
| 7 | Brush the timeline to one year, then lasso inside it | Map shows the intersection, counts agree with the table | count ___ · update ___ ms | count ___ · update ___ ms | |
| 8 | Open the query-time tree for a typed query | Tree appears from cached labels, no LLM, no network | ___ ms · branches ___ | ___ ms · branches ___ | |
| 9 | **FAILURE:** force the integrated GPU (Intel UHD / low-power) or launch with software WebGL | Map degrades (hexagons / sampling), never a white screen or crash | ___ fps · fallback engaged y/n ___ | ___ fps · fallback engaged y/n ___ | Gates decision 10 |
| 10 | **FAILURE:** undo the clustering run | Themes and assignments revert atomically; library unchanged | undo ___ s · rows reverted ___ | undo ___ s · rows reverted ___ | |

**Sign-off:** date ______ · tester ______ · **go / no-go** ______

**Numbers feed back into:** step 9 fps fires or clears decision 10's reverse-if (fall back to `regl-scatterplot` + density sampling); steps 3–4 wall-clock set the nightly re-cluster policy written in P4 (decision 9 §d); step 5 VRAM sets the headroom the P4 local LLM may claim on the 3050.

### Exit criteria

- The demo screenshot exists and is committed to `docs/demo/`.
- Louvain and layout deterministic under a fixed seed; kNN < 120 s, Louvain < 30 s, first paint < 2 s at 100k.
- Lasso → stats → timeline → tree all cross-filter consistently.
- `runs` + diff + atomic undo proven before any AI touches structure.
- Map holds ≥ 30 fps on the weakest tested GPU path, or the documented fallback engages.

### What could go wrong

- **umap-js is stale (last published 2024) and unusable above ~10k**, even on landmarks. *Fallback:* the landmark set is already capped at 8–10k — if the fit itself is too slow, drop to 5k landmarks and measure the layout distortion on the stats panel, not by eye.
- **deck.gl cannot hold 60 fps on the Intel UHD path.** *Fallback:* decision 10's reverse-if — `regl-scatterplot` plus density sampling of the rendered set.
- **c-TF-IDF terms on mixed-language clusters are noise**, making themes unrecognisable (rig step 2 fails). *Fallback:* cluster at r = 1.0 within a language partition first, or accept placeholder labels and let P4's LLM labels carry the readability — but record it, because it lowers the demo's value.
- **P0+P1+P2 exceeds six weeks.** *Fallback:* decision 16's reverse-if is already authorised — cut the timeline brush, reduce stats to counts + top domains, ship the map alone. The demo existing beats the demo being complete.

---

## P3 — acquisition and provenance

**Branch** `v2/p3-acquisition` · **Duration** 12–18 days · **Depends on** P0 (schema, jobs); P2 for the badge surfaces

**Goal.** Put real content behind every bookmark: tiers 0, 1, 2, 3, 4, 6 and 8, with per-hostname rate limiting, robots compliance, content versioning, visible provenance and opt-in content-addressed snapshots.

**The one thing that must be true at the end.** Point it at 2,000 of the user's real URLs, walk away, and come back to ≥ 75% of them carrying extracted text and a provenance badge that says exactly how it was obtained — with no hard errors anywhere.

### Deliverables

- `packages/core/src/acquire/` — `router`, `rateLimiter`, `robots`, `tiers/{api,shims,fetchExtract,pdf,archive,cloud,fail}`.
- `apps/desktop/src/main/renderTier.ts` — hidden `BrowserWindow` (tier 4).
- `packages/core/src/snapshot/` — BLAKE3 content addressing, zstd, 5 GB LRU store.
- `packages/ui/src/ProvenanceBadge.tsx`; `apps/desktop/src/renderer/screens/AcquisitionQueue.tsx`.
- `fixtures/extractors/<domain>/*.html` + `.expected.json` (~40 domains).
- `.github/workflows/canary.yml` — weekly live canary, allowed to fail loudly.
- `docs/acquisition.md`.

### Ordered tasks

1. Hostname router selecting a tier, recording `acquisitionMethod` on `content_versions`, stopping at first success — `router.test.ts`: 30 hostnames map to the expected tier.
2. Tier 0 structured APIs (GitHub REST, arXiv, HN Firebase, Reddit `.json`, Bluesky `getPostThread`, Mastodon, Wikipedia REST) — one golden fixture per source.
3. Tier 1 YouTube via `youtubei.js` (metadata + captions) [port: `services/geminiService.ts#fetchYouTubeContext`] — golden fixture asserts title, channel, duration, captions present.
4. Tier 1 X via FxEmbed / syndication and Threads via oEmbed [port: `#fetchTweetContext`, `#fetchThreadsContext`]; the bearer-token flow is deleted — golden fixtures for both.
5. Tier 2 `undici` (real UA, `Accept-Language: fr,en`) → `defuddle` → `@mozilla/readability` fallback, parsed with `linkedom`, merged with OpenGraph [port: `#fetchWebContext`] — the 40-domain golden suite passes ≥ 90%.
6. Tier 3 PDFs via `unpdf`; < 100 chars/page ⇒ scanned ⇒ `tesseract.js` `fra+eng` behind a flag — `pdf.test.ts`: text plus page-anchored offsets on 5 PDFs, one scanned.
7. Tier 4 hidden `BrowserWindow`: real session + UA, wait for network-idle, `executeJavaScript(outerHTML)` → tier 2 extraction — manual on 10 known tier-2 failures, ≥ 6 recovered.
8. Tier 6 Wayback availability API → archived HTML → tier 2 — `wayback.test.ts` against a recorded response.
9. Tier 8 graceful failure: URL + OG tags + low confidence + reason, never a thrown error [port: `server.ts` confidence-fallback post-processing] — `fail.test.ts`: never throws on 20 malformed inputs.
10. Tier 7 cloud extraction present but **off**, requiring a per-action confirmation and writing an `egress_log` row — `egress.test.ts`: zero rows while off, exactly one row per confirmed call.
11. Rate limiter: 1 req / 2 s per hostname with jitter, global concurrency 4, bulk backfill capped at 2,000 URLs/day and explicitly started — `ratelimit.test.ts` with a fake clock; the cap is enforced across restarts.
12. robots.txt honoured for tiers 2 and 4, with a per-domain override that writes a log line — `robots.test.ts`: allow / deny / override paths.
13. Content versioning: one `content_versions` row per fetch (tier, `http_status`, lang, text, `text_hash`, `snapshot_hash`, confidence, reason) [port: `server.ts` platform + thumbnail post-processing] — `versions.test.ts`: re-fetch appends a version, never overwrites.
14. Snapshots: BLAKE3-addressed `.html.zst`, opt-in per collection, ~2 MB/page target, 5 GB LRU eviction — `snapshot.test.ts`: identical bytes → identical path; LRU evicts least-recently-used first.
15. Acquisition queue screen: per-item tier, retry count, failure reason, pause/resume, re-run failed — manual: pause mid-run, resume, zero duplicate fetches.
16. Provenance badge in the library row, the map tooltip and the detail pane [port: `ConfidenceBadge`, `PlatformBadge`] — visible on 100% of rows, including tier-8 failures.
17. Re-extract from stored raw bytes when the extractor improves (no re-fetch) — `reextract.test.ts`: a new extractor version produces a new `content_versions` row from the stored snapshot.
18. Weekly live canary over the 40 fixture domains, non-blocking, posting a diff summary — one canary run completes and reports.
19. Playwright smoke #4 — add a URL → tier-2 extraction runs → text present and a badge rendered.

### Automated tests added

**Golden extractor fixtures (~40 domains) start here**, built from raw fetched bytes, plus the **weekly live canary** allowed to fail loudly without blocking. Rate-limiter fake-clock tests. Snapshot CAS and LRU tests. Smoke #4.

### Human rig test — P3

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Notes |
|---|---|---|---|---|---|
| 1 | **COLD:** fresh `userData` and a fresh browser profile inside the app — acquire 20 mixed real URLs (article, YouTube, X, PDF, GitHub, paywalled) | Every item ends in a terminal state with a badge; none errors out | success ___ /20 · total ___ s · tiers used ___ | success ___ /20 · total ___ s · tiers used ___ | |
| 2 | Check the tier distribution in the queue screen | Tier 0/1 used where expected, tier 4 only after tier 2 failed | tier2 ___ · tier4 ___ · tier8 ___ | tier2 ___ · tier4 ___ · tier8 ___ | |
| 3 | Acquire one known bot-walled page with tier 4 | Text extracted, badge reads `rendu / rendered` | ___ s · window peak RSS ___ MB | ___ s · window peak RSS ___ MB | |
| 4 | **SCALE:** start a 2,000-URL backfill from the real corpus and let it run 2 h | Rate limiter holds; no hostname exceeds 1 req / 2 s | throughput ___ URL/min · success ___ % · 429s ___ | throughput ___ URL/min · success ___ % · 429s ___ | Gates decision 7 |
| 5 | **SCALE:** during step 4, use search and the map | UI stays responsive; queue yields | search p95 ___ ms · map ___ fps | search p95 ___ ms · map ___ fps | |
| 6 | Enable snapshots for one collection, acquire 200 pages | Snapshots written content-addressed, dedup on identical pages | avg ___ KB/page · store ___ MB · dedup hits ___ | avg ___ KB/page · store ___ MB · dedup hits ___ | Sizes the 5 GB cap |
| 7 | **FAILURE:** turn the network off mid-backfill, wait 60 s, turn it back on | Queue pauses with a bilingual reason, resumes without duplicates | pause ___ s · duplicates ___ (must be 0) | pause ___ s · duplicates ___ | |
| 8 | **FAILURE:** acquire a URL behind a Cloudflare challenge and a 403 | Falls through to tier 6 then tier 8; badge explains; no crash | time to terminal ___ s · final tier ___ | time to terminal ___ s · final tier ___ | |
| 9 | **FAILURE:** acquire a corrupt PDF and a 400 MB PDF | Both end in tier 8 with a reason; memory does not spike | peak RSS ___ MB · time ___ s | peak RSS ___ MB · time ___ s | |
| 10 | Check `egress_log` after the session | Every third-party fetch has a row with host, purpose, bytes | rows ___ · unexplained rows ___ (must be 0) | rows ___ · unexplained rows ___ | |

**Sign-off:** date ______ · tester ______ · **go / no-go** ______

**Numbers feed back into:** step 4's tier 2+4 success rate fires or clears decision 7's reverse-if (pull the MV3 extension into v1); step 6's KB/page sets the snapshot LRU cap and the P6 bundle-size warning threshold; step 4's throughput sets the honest ETA shown when a friend imports 10,000 links.

### Exit criteria

- ≥ 75% of the real corpus acquires with extracted text; no URL produces a hard error.
- 40 golden fixtures green; the canary workflow runs weekly and reports.
- Rate limit and the 2,000/day bulk cap enforced across restarts.
- Every bookmark shows a provenance badge and a confidence reason.
- Snapshots opt-in, content-addressed, LRU-capped; never included in a bundle without confirmation.

### What could go wrong

- **Extractor rot** — YouTube PoToken, X syndication changes, Threads oEmbed removal (Expert risk #2, Doubtful §4.4). *Fallback:* the tier chain never hard-fails; the canary tells you which shim died; tier 4 and, later, P8's extension cover the gap.
- **The home IP gets blocked** by a large host during the backfill. *Fallback:* the 1 req / 2 s + 2,000/day cap is deliberately conservative; if it still happens, lower concurrency to 2 and add a per-domain daily cap.
- **Tier 4 is detected anyway** on the hardest sites. *Fallback:* accept it — tier 4 was always the 80% answer; the paywalled remainder is P8's job, and step 4's number decides whether P8 moves into v1.
- **Snapshots blow the disk** on a user who enables them library-wide. *Fallback:* the 5 GB LRU is enforced in the writer, not the UI, and the enable dialog names the projected size from step 6's measured KB/page.

---

## P4 — generation providers, summaries, taxonomy and trees

**Branch** `v2/p4-generation-taxonomy` · **Duration** 15–22 days · **Depends on** P3 (text to summarise) and P2 (clusters to label)

**Goal.** Introduce everything the LLM is allowed to do — cluster labels, prioritised summaries, tag consolidation, the persistent tree — behind the pluggable provider chain and, without exception, behind the review queue.

**The one thing that must be true at the end.** Press "Réorganiser ma bibliothèque", go to bed, wake up to a diff you can accept or reject item by item, and undo the whole run atomically thirty days later.

> **Calendar note:** start the Apple Developer Program enrolment on day 1 of this phase. It is a P7 deliverable with a multi-week external lead time.

### Deliverables

- `packages/core/src/generate/` — `GenerationProvider` interface, `ollama`, `lmstudio`, `localPack`, `cloud`, `extractive`, and the probe order.
- `apps/desktop/src/main/llmProcess.ts` (`utilityProcess`); `packages/ui/src/ai/LocalPackInstaller.tsx`, `AiBudgetPanel.tsx`.
- `packages/core/src/taxonomy/` — `labelClusters`, `siblingDedupe`, `refineTail`, `tagConsolidate`, `treeMaterialise`.
- `packages/ui/src/review/` — `ReviewQueue`, `RunDiff`, `UndoRun`.
- `packages/ui/src/tree/TreeEditor.tsx` — drag (fractional index), rename, pin.
- `packages/core/src/eval/` + `fixtures/eval/{urls-50.json,queries-30.json,summaries.json}`.
- `apps/desktop/src/renderer/screens/EgressLog.tsx`.

### Ordered tasks

1. `GenerationProvider` interface with structured output defined once in Zod, emitted as JSON Schema, and re-validated after every call — `provider.test.ts` against a deterministic stub provider.
2. Probe order — detected Ollama → LM Studio → local pack → cloud key → extractive — surfaced and overridable in Settings — manual on both rigs; Ollama wins on the Windows dev machine.
3. Ollama backend via `ollama-ai-provider-v2` (the development-time default) — `ollama.test.ts` skips cleanly with no daemon; measured tok/s recorded per model.
4. Cloud backends: `@ai-sdk/anthropic` (`claude-haiku-4-5`, Message Batches) and `@ai-sdk/google` (`gemini-3.8-flash`, model id read from config, not hardcoded) — `cloud.test.ts` against recorded responses.
5. Free-tier Gemini blocking modal with an unchecked training-policy box in plain FR/EN; unchecked ⇒ that provider is restricted to URL + title — `egress-scope.test.ts` asserts the restricted payload.
6. Egress scope enforcement: URL + title + ≤ 2,000 characters of text by default; anything more requires a per-action confirmation naming what is sent — `egress-scope.test.ts` truncation + one `egress_log` row per call.
7. Local AI pack: `node-llama-cpp` Vulkan / Metal / CPU prebuilds downloaded in-app with progress, run in a `utilityProcess`; VRAM probe at startup picks Qwen3.5-4B Q4_K_M @ 4K or Gemma 4 E2B Q4 — manual on both rigs: install, load, first token.
8. Embeddings forced to CPU whenever an LLM is resident — `residency.test.ts` on the scheduler; VRAM confirmed by hand on the 3050.
9. Cluster labelling: 8 c-TF-IDF terms + 5 titles + 3 leads → `{label_fr, label_en, description_fr, description_en, emoji, parent_hint}` — `label.test.ts`: schema-valid, both languages non-empty, label ≤ 40 chars.
10. Sibling dedupe pass per resolution (merge / split proposals) — `dedupe.test.ts` merges two synthetic near-identical siblings and leaves a genuine pair alone.
11. Refine tail: docs whose top-2 centroids are within 0.02 go to the LLM, capped at 5% of the corpus — `refine.test.ts` asserts the cap holds at 100k.
12. Tag consolidation: normalise (NFKC, casefold, de-diacritic, singularise FR+EN) → embed → agglomerative merge at cosine ≥ 0.88 → Jaccard < 0.05 homonym guard → LLM adjudication → FR/EN pairing — `tags.test.ts`: "Python" the snake and "Python" the language stay separate.
13. Review queue: run → diff → per-item and bulk accept/reject → 30-day atomic undo; the only auto-apply is a *new* bookmark into an *existing* theme, and AI tags attach with `accepted=false` in a distinct style — `runs.test.ts`: undo of a 400-merge run restores byte-identical tag state.
14. Persistent tree materialisation, depth capped at 4, stable node ids matched old → new by centroid similarity — `treeStability.test.ts`: re-running with 3% new docs preserves ≥ 95% of pinned and renamed nodes.
15. Tree editor: drag with fractional indices, rename, pin a query-time branch as `kind=pin` — `fracIndex.test.ts`: 1,000 random inserts preserve order with no collisions or rebalance.
16. Prioritised summary queue (opened twice, starred, active collection, newest N) with a default cap of 300 calls/night, pausable, throttled — `priority.test.ts` ordering; one real overnight run recorded.
17. Cloud proposal moment: when a job's local ETA exceeds 2 h, show the priced comparison built from *measured* tok/s ("local ≈ 9 h 20 / Haiku Batches ≈ 1 h, ≈ 3 €") — manual; the numbers come from the P4 rig test, not from estimates.
18. AI eval harness: 50 labelled URLs (25 FR, 25 EN) scored on `{titleContains, keywordsOverlap ≥ 3, platform, language}` + 30 queries scored hit@5 / MRR@10 + summary quality judged by `claude-haiku-4-5` in a batch — `npm run eval` gates any model or prompt change from here on.
19. Egress log as a first-class screen, exportable to CSV — manual: one cloud call produces exactly one row with host, purpose, item count, bytes, collection.
20. Playwright smoke #5 — run a labelling job on a 500-doc fixture with the stub provider → diff screen lists N proposals → accept → theme names change → undo restores them.

### Automated tests added

**The AI eval harness starts here and gates every model and prompt change.** Review-queue and atomic-undo tests. Provider contract tests against a stub. Structured-output schema validation tests. Smoke #5.

### Human rig test — P4

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Notes |
|---|---|---|---|---|---|
| 1 | **COLD:** fresh `userData`, no Ollama, no pack, no cloud key — ask for a summary | App says "extractive only", gives a usable 3-sentence lead, never an error | time to lead ___ ms | time to lead ___ ms | |
| 2 | Install the local AI pack from inside the app | Download + first token succeed unattended | pack ___ MB · install ___ s · first token ___ s | pack ___ MB · install ___ s · first token ___ s | Gates decision 4 |
| 3 | Generate 20 structured summaries with the default model | All 20 schema-valid on first or second attempt | ___ tok/s · ___ s/summary · VRAM ___ MB · GPU ___ °C | ___ tok/s · ___ s/summary · RAM ___ MB · ___ °C | **Sets the default model** |
| 4 | Repeat step 3 with the alternate model (Gemma 4 E2B / E4B) | Comparable schema validity | ___ tok/s · ___ s/summary · VRAM ___ MB | ___ tok/s · ___ s/summary · RAM ___ MB | |
| 5 | Run the embedding queue *while* the LLM is loaded | Embeddings stay on CPU; neither process OOMs | embed ___ chunks/s · total VRAM ___ MB | embed ___ chunks/s · total RAM ___ MB | |
| 6 | **SCALE:** run "Réorganiser ma bibliothèque" over `fixtures/100k.db` overnight | Completes or pauses cleanly; call count within the planned ~2,000 | LLM calls ___ · wall clock ___ h · sustained ___ °C | LLM calls ___ · wall clock ___ h · ___ °C | Sets the cloud-proposal threshold |
| 7 | **SCALE:** review the resulting diff | Diff renders without freezing; bulk accept works | proposals ___ · diff render ___ s · accept-all ___ s | proposals ___ · diff render ___ s · accept-all ___ s | |
| 8 | Undo that run the next day | Tags, themes and tree revert atomically | undo ___ s · rows reverted ___ | undo ___ s · rows reverted ___ | |
| 9 | **FAILURE:** force-kill the LLM `utilityProcess` mid-run | Library process survives; the job resumes or fails named, never silently | app alive y/n ___ · resume ___ s · items lost ___ | app alive y/n ___ · resume ___ s · items lost ___ | |
| 10 | **FAILURE:** point at a model that returns malformed JSON twice, with the network off | Falls back per decision 5 (retry → extractive), offers the cloud only when a key exists | retries ___ · fallback path ___ | retries ___ · fallback path ___ | |

**Sign-off:** date ______ · tester ______ · **go / no-go** ______

**Numbers feed back into:** step 3/4 tok/s **sets the default model per rig** (decision 5) and replaces the Expert's estimates everywhere in this plan; step 6's call count and wall clock set the nightly budget cap (default 300) and the 2 h cloud-proposal threshold; step 2 failing twice on a friend's Windows machine fires decision 4's reverse-if (bundle Vulkan+Metal+CPU and eat the ~300 MB).

### Exit criteria

- Provider chain probes correctly on both rigs and degrades to extractive with nothing installed.
- Default model per rig chosen from measured tok/s and written into `plans/p4-generation-taxonomy.md`.
- Nothing that changes tags or structure applies without acceptance; 30-day atomic undo proven on a 400-item run.
- Tree survives regeneration: ≥ 95% of pinned and renamed nodes preserved.
- AI eval harness green and recorded as the baseline that gates future prompt changes.
- Egress log screen shows one row per cloud call with a byte count.

### What could go wrong

- **4 GB VRAM binding** — Qwen3.5-4B @ 4K plus context does not fit alongside anything else (Expert risk #4). *Fallback:* Gemma 4 E2B becomes the Windows default; the probe already supports it; rig step 3/4 decides.
- **Local reorganisation of 100k takes days, not a night** (Expert risk #3). *Fallback:* the budget tiers already cap it; the honest answer in the UI is the priced Haiku Batches comparison, and the user chooses.
- **The review diff is unreadable at 400+ proposals** and gets bulk-accepted blindly, which is the trust failure decision 9 exists to prevent (Expert risk #10). *Fallback:* group the diff by theme, cap the default run size, and make "accept all" require typing the count.
- **Local structured output fails repeatedly** on a 4B model. *Fallback:* the two-strike rule routes the item to the cloud proposal; if it is systemic, drop to a simpler schema (label + emoji only) and generate descriptions separately.

---

## P5 — ask this selection

**Branch** `v2/p5-ask-selection` · **Duration** 6–9 days · **Depends on** P4 (providers) and P2 (selections)

**Goal.** The map's payoff: scoped retrieval-augmented answers over a lasso selection, a collection or a saved group — ≤ 500 chunks, brute force, citations — and the same pipeline shows ranked passages when no generation provider exists.

**The one thing that must be true at the end.** Lasso 80 links on the map, ask a question in French about English sources, and get an answer whose citation chips scroll the reader to the exact cited passage.

### Deliverables

- `packages/core/src/groups/` — saved selections as first-class rows with `collection_id`.
- `packages/core/src/rag/` — `scope`, `retrieve`, `contextBudget`, `citations`.
- `packages/ui/src/ask/` — `AskPanel`, `CitationChip`, `PassageList`, `SourceChips`.
- `fixtures/eval/rag-20.json` — 20 `(question, selection, expectedFacts)` cases.

### Ordered tasks

1. Saved selection / group entity persisted from a lasso, a collection or a query — `groups.test.ts` round-trip, including a lasso polygon.
2. Scope resolver capping at 500 chunks with a visible "périmètre réduit / scope trimmed" notice naming what was dropped — `scope.test.ts` at 501 and at 10,000 chunks.
3. Brute-force exact vector search over the scoped BLOBs — p95 < 150 ms at 500 chunks (this number is the trigger for decision 8's usearch reverse-if).
4. BM25 (k=50) + vector (k=50) → RRF → top 6–8, reusing P1's fusion code unchanged — `ragRetrieve.test.ts` on a fixed ranking fixture.
5. Context budget ≤ 3,000 tokens for a 4B model; over budget, compress chunks to 2 sentences before dropping any — `budget.test.ts` never exceeds and never returns zero chunks.
6. Citation contract `[[c:<chunkId>]]` in the prompt, parsed out; regenerate exactly once if the answer contains zero markers — `citations.test.ts` parser + zero-marker retry + give-up label.
7. Citation chips resolve to `bookmark#charStart` and scroll the reader to the offset — manual on 10 answers across PDF, article and video-transcript sources.
8. No-provider mode: the same pipeline returns ranked passages, clearly labelled as passages, not an answer — manual with every provider disabled.
9. "utilisé / non utilisé" marks on the source chips so the user sees what the model actually read — manual.
10. Answer in the UI locale regardless of source language — `lang.test.ts` on 6 FR-question / EN-source pairs.
11. Pre-warm the scoped chunk vectors when a selection is made, so the first question is not the slow one — measured: second question ≥ 30% faster than a cold first.
12. `fixtures/eval/rag-20.json` scored acceptable / not acceptable; below ~70% fires decision 11's reverse-if — baseline recorded in `plans/p5-ask-selection.md`.
13. Playwright smoke #6 — lasso → Ask → the answer contains ≥ 1 citation chip that resolves to a real bookmark.

### Automated tests added

RAG retrieval ranking tests, context-budget invariants, citation parser and retry tests, the 20-case RAG eval added to the P4 harness (so `npm run eval` now gates retrieval, summaries and grounded answers). Smoke #6.

### Human rig test — P5

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Notes |
|---|---|---|---|---|---|
| 1 | **COLD:** fresh `userData` with only the embedding model — lasso 80 links, ask a question | Ranked passages returned and labelled as passages, not an answer | ___ ms · passages ___ | ___ ms · passages ___ | |
| 2 | Install / enable the local model, ask the same question | Answer generated with ≥ 1 citation | first token ___ s · full answer ___ s · ___ tok/s | first token ___ s · full answer ___ s · ___ tok/s | |
| 3 | Click three citation chips | Each scrolls the reader to the cited passage, visibly correct | correct ___ /3 · scroll ___ ms | correct ___ /3 · scroll ___ ms | |
| 4 | Ask in French over an English-only selection | Answer is in French and cites the English sources | language correct y/n ___ · citations ___ | language correct y/n ___ · citations ___ | |
| 5 | **SCALE:** build a 500-chunk selection from `fixtures/100k.db` and ask | Retrieval inside budget; no scope-trim needed | retrieval ___ ms · context ___ tokens | retrieval ___ ms · context ___ tokens | Gates decision 8 |
| 6 | **SCALE:** lasso ~5,000 links and ask | Scope trim notice appears and names what was dropped | trim notice y/n ___ · retrieval ___ ms | trim notice y/n ___ · retrieval ___ ms | |
| 7 | Run `npm run eval:rag` (20 cases) | Baseline recorded | acceptable ___ /20 | acceptable ___ /20 | Gates decision 11 |
| 8 | Ask a question the selection cannot answer | Says so; does not invent; zero-citation answers are labelled "non sourcé" | hallucinated y/n ___ | hallucinated y/n ___ | |
| 9 | **FAILURE:** select a cloud provider, turn the network off, ask | Falls back to local or to passages; never an error toast alone | fallback ___ s · path ___ | fallback ___ s · path ___ | |
| 10 | **FAILURE:** ask against a selection whose text was never acquired (tier-8 only) | Says the selection has no content; offers to acquire | message correct y/n ___ · items flagged ___ | message correct y/n ___ · items flagged ___ | |

**Sign-off:** date ______ · tester ______ · **go / no-go** ______

**Numbers feed back into:** step 5 retrieval latency fires or clears decision 8's reverse-if (pull usearch forward from v2); step 7's acceptable count fires decision 11's reverse-if (ship ranked passages only and hold generated answers for a cloud or 8B path); step 2's tok/s confirms the P4 default-model choice under a longer prompt.

### Exit criteria

- Ranked-passage mode is fully useful with no generation provider installed.
- Citations resolve to real offsets in at least 9 of 10 hand-checked answers.
- Scoped brute-force retrieval p95 < 150 ms at 500 chunks on both rigs.
- RAG eval baseline recorded; the ≥ 70% gate met or the reverse-if declared.
- Zero-citation answers labelled, never presented as sourced.

### What could go wrong

- **A 4B model produces fluent, uncited, wrong answers.** *Fallback:* decision 11's reverse-if — ranked passages only; the retrieval work is not wasted.
- **Chunk offsets drift** when a bookmark is re-acquired and its text changes, breaking old citations. *Fallback:* citations carry the `content_version_id`; a chip whose version is superseded says so rather than scrolling to the wrong place.
- **Selections of 5,000+ links are the normal user gesture**, making the 500-chunk cap feel broken. *Fallback:* trim by relevance to the question, show the notice, and offer "summarise the selection" (a P4 job) as the honest alternative.

---

## P6 — identity and encrypted bundle sharing

**Branch** `v2/p6-sharing-bundles` · **Duration** 10–15 days · **Depends on** P0 (ops, `applyOp`), P1 (embeddings to ship inside the bundle), P3 (text to ship)

**Goal.** Ed25519 identity in `safeStorage`, per-collection epoch keys, the `.bkmshare` sealed bundle format, import-by-merge through the op log, and optional iroh direct transfer behind a flag.

**The one thing that must be true at the end.** Email a friend a `.bkmshare` of 40 links; they open it in a fresh install with no models and immediately get the links, the extracted text, the tags and working semantic search.

### Deliverables

- `packages/core/src/identity/` — Ed25519 master key, BIP39 24-word backup, X25519 derivation.
- `packages/core/src/crypto/` — XChaCha20-Poly1305 sealing, `K_epoch`, per-member wrapping, rotation.
- `packages/core/src/bundle/` — streaming writer and reader (JSONL records + manifest + BLAKE3-addressed blobs).
- `packages/core/src/merge/` — op-log LWW merge (the function Loro replaces in P9).
- `apps/desktop/src/main/safeStorageKeys.ts`; `apps/desktop/src/main/irohTransfer.ts` (feature-flagged).
- `packages/ui/src/share/` — `ShareDialog`, `ReceiveDialog`, `MembersPanel`, `P2PDisclosure`.
- `docs/bundle-format.md`, `packages/core/test/regressions/` (fast-check seeds).

### Ordered tasks

1. Ed25519 identity generated on first run; private key stored via Electron `safeStorage` — `identity.test.ts`; manual: the key is not readable as plaintext in `userData`.
2. BIP39 24-word backup and restore flow, FR/EN — manual: restoring on the other rig reproduces the same public key.
3. X25519 derivation via `@noble/curves` for key agreement — `kex.test.ts` against known-answer vectors.
4. Per-collection `K_epoch` (32 random bytes) wrapped to each member's X25519 key; rotation on removal — `epoch.test.ts`: a removed member cannot open epoch n+1, and the UI states plainly that removal prevents future changes only.
5. Migrate the P4 API keys and any per-collection keys into `safeStorage` — `keys.test.ts`: no key material in any settings JSON.
6. `.bkmshare` writer: JSONL records + extracted text + 768-d embeddings + optional snapshots, sealed XChaCha20-Poly1305, signed Ed25519, fully streamed — a 5,000-link bundle writes in < 20 s with bounded memory.
7. Reader verifying the signature *before* writing anything — `bundle.test.ts`: a single flipped byte is rejected and zero rows are committed.
8. Import-by-merge through `applyOp`, never overwrite — `merge.test.ts`: importing the same bundle twice is a no-op; a locally edited title survives a re-import with an older HLC.
9. **fast-check property tests on the op-log merge** — random op sequences across 3 actors, random apply orders, assert convergence and no field loss; failing seeds recorded in `regressions/` — `merge.property.test.ts`.
10. Members panel with roles (owner / writer / reader) and the current epoch — manual.
11. Re-export / subscription flow: publisher re-exports, receiver merges, receiver's local edits survive — manual two-rig test with a deliberate concurrent edit.
12. iroh direct transfer behind a feature flag (`@number0/iroh`), with a connection indicator reading *directe / relayée / hors ligne* — manual on Wi-Fi and on a phone hotspot.
13. P2P disclosure modal shown once before the first direct share, in plain FR/EN, exactly as decision 15 words it — manual in both locales.
14. `egress_log` rows for every peer transfer, with byte counts — `egress.test.ts`.
15. Snapshot inclusion requires an explicit confirmation naming the size — manual at a 1.2 GB bundle.
16. Default domain exclusion list applied to share as well as fetch: excluded-domain items are never placed in a bundle — `exclusions.test.ts`.
17. Playwright smoke #7 — export a bundle → fresh `userData` → import → row count and search both correct.

### Automated tests added

**fast-check property tests on the op-log merge start here**, with a `regressions/` seed folder. Bundle tamper-rejection tests. Epoch rotation tests. Smoke #7.

### Human rig test — P6

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Notes |
|---|---|---|---|---|---|
| 1 | **COLD:** fresh `userData`, no models — receive and open a 40-link `.bkmshare` | Links, text, tags and semantic search all work with no model download | import ___ s · search p95 ___ ms | import ___ s · search p95 ___ ms | The friend experience |
| 2 | Create an identity, back it up with the 24 words, restore on the other rig | Same public key on both machines | backup ___ s · restore ___ s · key match y/n ___ | backup ___ s · restore ___ s · key match y/n ___ | |
| 3 | Share a 500-link collection with snapshots off | Bundle written streamed, size warning accurate | bundle ___ MB · write ___ s · peak RSS ___ MB | bundle ___ MB · write ___ s · peak RSS ___ MB | |
| 4 | **SCALE:** bundle 20,000 links from `fixtures/100k.db` | Memory stays bounded; no OOM | bundle ___ MB · write ___ s · read ___ s · peak RSS ___ MB | bundle ___ MB · write ___ s · read ___ s · peak RSS ___ MB | Sizes v1.5 mailbox |
| 5 | Both rigs edit the same received collection, then re-export / re-merge | Both edits survive; no silent overwrite | conflicts ___ · lost edits ___ (must be 0) | conflicts ___ · lost edits ___ | Gates decision 2 |
| 6 | Remove a member, rotate the epoch, re-share | Removed member cannot open the new bundle | rotate ___ s · re-wrap members ___ | rotate ___ s · re-wrap members ___ | |
| 7 | Direct transfer over iroh on the same Wi-Fi | Indicator reads "directe"; transfer completes | ___ MB/s · connect ___ s · path ___ | ___ MB/s · connect ___ s · path ___ | |
| 8 | **FAILURE:** repeat step 7 with one rig on a phone hotspot (symmetric NAT) | Falls back to relay or states "hors ligne" clearly; never hangs | connect ___ s · path ___ · throughput ___ MB/s | connect ___ s · path ___ · throughput ___ MB/s | |
| 9 | **FAILURE:** flip one byte in a `.bkmshare`, import it | Rejected before any write; named bilingual error | rows committed ___ (must be 0) · detect ___ s | rows committed ___ · detect ___ s | |
| 10 | **FAILURE:** import a bundle sealed to a different key | Clear "not addressed to you" message, no crash, no partial state | message correct y/n ___ | message correct y/n ___ | |

**Sign-off:** date ______ · tester ______ · **go / no-go** ______

**Numbers feed back into:** step 4's MB-per-link sets the v1.5 mailbox node sizing and the snapshot-inclusion warning threshold; step 5's lost-edit count is the direct trigger for decision 2's reverse-if (pull Loro forward a phase); step 7/8's connect path decides whether iroh direct transfer ships enabled or stays flagged off in v1.

### Exit criteria

- Identity generated, stored in `safeStorage`, backed up and restored across machines.
- Bundles stream, verify signatures before writing, and merge idempotently through `applyOp`.
- fast-check merge properties green with a committed `regressions/` folder.
- Epoch rotation locks out a removed member for future epochs, and the UI says exactly that.
- P2P disclosure shown once before the first direct share, in both locales.

### What could go wrong

- **Loro has no permissions or crypto, and neither does this hand-rolled layer** (Expert risk #6). *Fallback:* `@noble` primitives only, encrypt before anything leaves the process, property-test epoch rotation; no MLS attempt in 2026.
- **The op-log LWW merge grows past ~300 lines or needs per-type rules.** *Fallback:* decision 3's reverse-if — that is Loro asking to be adopted early; pull P9 forward rather than reimplementing it badly.
- **No `@number0/iroh` darwin-x64 prebuild**, so an Intel Mac friend cannot direct-transfer. *Fallback:* decision 13 already accepts this — bundles by file are the v1 path, and the feature flag stays off on x64.
- **A friend cannot open the bundle** because the mail provider rewrites or blocks the attachment. *Fallback:* the format is one file with no external dependencies; document WeTransfer / USB / Signal explicitly in `docs/`.

---

## P7 — signing, updates, polish → **v1**

**Branch** `v2/p7-release` · **Duration** 10–15 days · **Depends on** P0–P6. **External calendar dependency:** Apple Developer enrolment started in P4.

**Goal.** Turn a working app into something a non-technical friend installs, updates and recovers from without you on the phone.

**The one thing that must be true at the end.** A friend double-clicks the installer on a machine that has never seen the app and is searching their own bookmarks ten minutes later, with no Gatekeeper or SmartScreen dead-end.

### Deliverables

- `apps/desktop/electron-builder.yml` — NSIS x64 + portable ZIP; notarized arm64 dmg; best-effort x64 dmg; AppImage + .deb.
- `apps/desktop/src/main/updater.ts` [port: `artlux/src/main/updater.ts`], `scripts/verify-mac-signature.cjs` [port: artlux].
- `.github/workflows/release.yml` — tag push → signed installers + `latest.yml` / `latest-mac.yml` → GitHub Releases.
- `apps/desktop/src/renderer/screens/` — `Onboarding`, `EgressLog` (promoted), `About`.
- `packages/core/src/export/` — full export, streamed.
- `docs/` — `install-windows.{fr,en}.md`, `install-macos.{fr,en}.md`, `recovery.md`, `privacy.{fr,en}.md`, `smartscreen.{fr,en}.md`.

### Ordered tasks

1. Apple Developer certificates into CI secrets; `notarytool` wired into electron-builder — a notarized dmg opens on a Mac that has never seen the app, with no right-click-open workaround.
2. Port artlux's fuses-vs-signature tripwire and run it in CI — `verify-mac-signature` fails a deliberately broken build.
3. Windows: unsigned NSIS + portable ZIP + a bilingual SmartScreen explainer page linked from the download — a non-technical tester installs from the written instructions without calling.
4. Linux AppImage + .deb — both install on one Ubuntu VM; the AppImage runs without a sandbox flag.
5. `electron-updater` with `autoDownload: false` and IPC-driven check / download / install, background check 4 s after startup [port: artlux] — manual 0.1.0 → 0.1.1 update on both rigs.
6. Release workflow dry run on a tag — installers plus update manifests published and consumed by step 5.
7. Onboarding: language, the "no cloud by default" statement, model download choice with the *measured* P1/P4 times, and the first import source — manual with a real non-technical tester, start to first search timed.
8. Default domain exclusion list shipped as an editable data file (banking, health, webmail, cloud drives, `localhost`, private IP ranges, `*.local`) — `exclusions.test.ts`: a matching URL stores URL + title only, is never fetched and never sent to a cloud provider.
9. Egress log promoted to a top-level screen with CSV export — manual: a full session's cloud, fetch and peer activity is legible to a non-developer.
10. Full export — `bookmarks.json`, `bookmarks.html`, `markdown/`, `library.db`, `snapshots/` — fully streamed — 100k export < 5 min; round-trip row and content-hash equality.
11. `docs/recovery.md`: a plain `sqlite3` recipe to extract everything without the app — followed successfully by the tester on a copied `library.db`.
12. i18n completeness pass plus a pseudo-locale truncation check — 0 missing keys; no clipped label at 125% OS scaling.
13. Local-only error reporting (rotating log file + "reveal in folder"); no telemetry of any kind — manual; `rg "analytics|telemetry"` returns nothing live.
14. Performance pass on the packaged build (not the dev build): cold start, first paint, memory ceiling at 100k — cold start < 4 s on both rigs.
15. Licence audit of every dependency (MIT / Apache-2.0 / ISC / BSD only; Cosmograph absent; UpSet.js absent) — `npm run licence-check` green in CI.
16. Playwright smoke #8 — an install-shaped run: fresh `userData` → onboarding → import → search → map.
17. Tag `v1.0.0`; write `plans/p7-release.md` with every measured number from P0–P7.

### Automated tests added

Licence-check CI job. Packaged-build smoke #8 (run against the built artifact, not the dev server). Update-manifest consumption test. The full perf suite re-run against the packaged build, replacing the dev-build baselines in `plans/`.

### Human rig test — P7

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Notes |
|---|---|---|---|---|---|
| 1 | **COLD:** on a clean OS user account, download and install from the release artifact | Installs with no developer tooling; Gatekeeper/SmartScreen path documented and survivable | install ___ s · SmartScreen clicks ___ · Gatekeeper prompts ___ | install ___ s · Gatekeeper prompts ___ | |
| 2 | Complete onboarding to the first successful search | A non-technical tester needs no help | start→first search ___ min · help requests ___ | start→first search ___ min · help requests ___ | The v1 promise |
| 3 | Cold start the packaged app three times | Consistent, no first-run penalty after the first | cold start ___ s (avg of 3) · first paint ___ s | cold start ___ s · first paint ___ s | |
| 4 | **SCALE:** open the 100k fixture in the packaged build, search, map, lasso | All P0–P2 numbers hold within 20% of the dev build | search p95 ___ ms · map ___ fps · RSS ___ MB | search p95 ___ ms · map ___ fps · RSS ___ MB | Supersedes dev numbers |
| 5 | **SCALE:** run a full export of 100k and re-import into a fresh install | Round-trip equal; export streams without a memory spike | export ___ min · archive ___ GB · peak RSS ___ MB · row delta ___ | export ___ min · archive ___ GB · peak RSS ___ MB · row delta ___ | |
| 6 | Trigger an in-app update from 1.0.0 to 1.0.1 | Update downloads on explicit consent and installs | check ___ s · download ___ s · restart ___ s | check ___ s · download ___ s · restart ___ s | |
| 7 | Add a banking URL and a `localhost` URL | Stored as URL + title only; never fetched; no egress row | fetched y/n ___ (must be n) · egress rows ___ (must be 0) | fetched y/n ___ · egress rows ___ | |
| 8 | Read the egress log after a normal day of use | A non-developer can explain every row | rows ___ · unexplainable ___ (must be 0) | rows ___ · unexplainable ___ | |
| 9 | **FAILURE:** first launch with the network off | App is fully usable offline; no blocking dialog, no spinner forever | time to usable ___ s · blocking dialogs ___ (must be 0) | time to usable ___ s · blocking dialogs ___ | |
| 10 | **FAILURE:** make the update feed unreachable, then recover `library.db` with the `docs/recovery.md` sqlite3 recipe | Update failure is silent-but-logged; recovery recipe yields a readable CSV | update error handled y/n ___ · recovery ___ min | update error handled y/n ___ · recovery ___ min | |

**Sign-off:** date ______ · tester ______ · **go / no-go — this is the v1 gate** ______

**Numbers feed back into:** step 1's SmartScreen click count and step 2's help-request count decide whether to buy the Windows OV certificate now or stay on the explainer (decision 13); step 4's packaged-build numbers **replace** every dev-build number recorded in P0–P6; step 2 is the number quoted to friends.

### Exit criteria

- Notarized macOS build opens on a virgin Mac; Windows explainer path verified by a non-technical tester.
- Auto-update works end to end on both rigs from a real GitHub Release.
- Onboarding takes a friend from installer to first search unaided.
- Exclusion list, egress log and recovery recipe all verified by hand.
- Licence audit green; `v1.0.0` tagged and merged to `main` (the single v1 merge of decision 14).

### What could go wrong

- **Notarization rejected repeatedly** or the OV token process stalls (Expert risk #8). *Fallback:* decision 13's reverse-if — ship portable ZIP + AppImage only rather than delaying v1.
- **The €99 Apple enrolment was started too late.** *Fallback:* this is why task 1 of P4 starts it; if it still slips, ship Windows + Linux first and add the Mac build as 1.0.1.
- **Packaged-build performance is materially worse than dev** (asar, unpacked native modules, ASLR). *Fallback:* step 4 is the gate; `asarUnpack` the native modules and re-measure before tagging.
- **A friend's antivirus quarantines the unsigned NSIS.** *Fallback:* the portable ZIP is the documented second path; a quarantine event is a data point for the OV purchase decision.

---

## P8 — MV3 extension (v2 opens)

**Branch** `v2/p8-extension` · **Duration** 8–12 days · **Depends on** P7 (a released app to pair with), P3 (the tier contract)

**Goal.** Ship the only reliable fetcher for logged-in and paywalled content: an MV3 extension that posts the rendered, authenticated DOM to the desktop app over loopback.

**The one thing that must be true at the end.** A page behind a login that tier 4 cannot get is saved with full text, in one click, from the browser the user was already in.

### Deliverables

- `apps/extension/` — MV3 manifest, background service worker, content script, popup, options (Vite build for Chrome / Edge / Firefox).
- `apps/desktop/src/main/captureServer.ts` — `127.0.0.1:<port>/capture`, per-install shared secret, origin check.
- `packages/ui/src/pairing/PairingDialog.tsx`.
- `docs/extension.{fr,en}.md`, store listing assets.

### Ordered tasks

1. MV3 manifest and build pipeline — loads unpacked in Chrome, Edge and Firefox.
2. Loopback capture server bound to `127.0.0.1` with a per-install shared secret and an origin check — `capture.test.ts` rejects a wrong secret, a non-loopback origin and an oversized body.
3. Pairing: the app shows a code, the extension stores the secret in `chrome.storage.local` — manual on both rigs, including re-pairing after a reinstall.
4. Content script serialising the live DOM with SingleFile-style inlining (MIT-compatible code only; no Puppeteer dependency) — golden fixtures on 5 logged-in-shaped pages.
5. Tier 5 registered in the acquisition router and badged `extension` — `router.test.ts`.
6. Popup: save, choose collection, add tags, show a confirmed "enregistré" state — manual.
7. Context-menu "save link" and "save selection as note" — manual.
8. Offline queue: if the app is not running, hold captures in the extension and flush on reconnect — manual: save 5 pages with the app closed, open the app, all 5 arrive exactly once.
9. Payload cap and truncation policy matching the snapshot budget — `capture.test.ts` at 2 MB and at 12 MB.
10. FR/EN extension strings sharing the app's locale files — manual in both locales.
11. Sideload instructions plus store submission preparation — a non-technical tester installs from the written instructions unaided.
12. Playwright smoke #9 — POST a fixture payload to the capture endpoint → a bookmark exists with `acquisitionMethod = extension`.

### Automated tests added

Capture-server auth and size tests. Extension golden DOM fixtures added to the P3 suite. Smoke #9.

### Human rig test — P8

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Notes |
|---|---|---|---|---|---|
| 1 | **COLD:** fresh browser profile, fresh app `userData` — install the extension and pair | Pairing succeeds from the written instructions alone | install→paired ___ min · help requests ___ | install→paired ___ min · help requests ___ | |
| 2 | Save 10 ordinary pages from the popup | All 10 arrive with full text | success ___ /10 · avg ___ s · avg payload ___ KB | success ___ /10 · avg ___ s · avg payload ___ KB | |
| 3 | Save 5 pages that tier 4 failed on in P3 | Extension recovers pages the app could not | recovered ___ /5 | recovered ___ /5 | Gates tier-4 demotion |
| 4 | **SCALE:** save 50 pages in one browsing session | App stays responsive; queue drains; no duplicates | app RSS ___ MB · queue drain ___ s · duplicates ___ | app RSS ___ MB · queue drain ___ s · duplicates ___ | |
| 5 | Save a very heavy page (long article with many images) | Payload capped and truncation stated, not silently dropped | payload ___ MB · capped y/n ___ | payload ___ MB · capped y/n ___ | |
| 6 | Save from a logged-in account page | Authenticated content captured; no credentials stored anywhere | text captured y/n ___ · credential strings in DB ___ (must be 0) | text captured y/n ___ · credential strings ___ | |
| 7 | Check the egress log after the session | Loopback captures are logged as local, not as egress | mislabelled rows ___ (must be 0) | mislabelled rows ___ | |
| 8 | **FAILURE:** close the app, save 5 pages, reopen the app | All 5 flush exactly once | arrived ___ /5 · duplicates ___ | arrived ___ /5 · duplicates ___ | |
| 9 | **FAILURE:** point the extension at a wrong secret | Rejected with a clear re-pair prompt; no partial write | rejected y/n ___ · rows written ___ (must be 0) | rejected y/n ___ · rows written ___ | |
| 10 | **FAILURE:** another local process POSTs to the capture port | Rejected on origin + secret; one log line | rejected y/n ___ | rejected y/n ___ | |

**Sign-off:** date ______ · tester ______ · **go / no-go** ______

**Numbers feed back into:** step 3's recovery count decides whether tier 4 can be demoted to a fallback (simplifying the acquisition router); step 2/5's payload sizes confirm or raise the 2 MB snapshot budget from P3.

### Exit criteria

- Pairing works unaided on both rigs from the written instructions.
- Extension recovers pages tier 4 could not, with a measured delta.
- Offline queue flushes exactly once; no duplicates under any tested sequence.
- Capture endpoint rejects wrong secrets, non-loopback origins and oversized bodies.
- FR/EN parity with the desktop app.

### What could go wrong

- **Store review rejects the extension** or takes weeks. *Fallback:* sideload instructions are a first-class deliverable, not a stopgap; the app works without the extension.
- **MV3 service-worker lifecycle drops queued captures.** *Fallback:* persist the queue in `chrome.storage.local` on every enqueue, not on a timer; rig step 8 is the proof.
- **Users install the extension without the app.** *Fallback:* the popup detects no app and links to the installer in the right language.

---

## P9 — Loro and live sync

**Branch** `v2/p9-loro-sync` · **Duration** 18–28 days · **Depends on** P6 (identity, crypto, op log)

**Goal.** Replace the LWW merge *function* with Loro — one doc per collection, `LoroTree` for the hierarchy, SQLite demoted to a derived, rebuildable index — and add live sync over iroh with gossip catch-up.

**The one thing that must be true at the end.** Two people edit the same collection's tree simultaneously on two machines, one of them offline for an hour, and both end with the identical tree, with no lost edits and no cycles.

### Deliverables

- `packages/core/src/crdt/` — `docPerCollection`, `seedFromSqlite`, `project` (Loro event → one SQLite transaction), `rederive`.
- `packages/core/src/sync/` — `SyncTransport` interface, `irohTransport`, `trysteroTransport`, `mailbox` (NIP-44, v1.5 groundwork).
- `apps/desktop/src/main/syncProcess.ts`.
- `packages/ui/src/sync/` — `SyncStatus`, `ConflictInspector`, `InviteDialog` (+ QR).
- `tools/p2p-harness/` — N instances, separate `userData`, fake transport with partition / delay / drop / reorder.
- `packages/core/test/regressions/` — extended with CRDT seeds.

### Ordered tasks

1. Loro model: `collection:<uuid>` with `LoroMap meta`, `LoroMap items`, `LoroTree tree` — `crdtModel.test.ts` shape assertions.
2. Migration: seed a fresh Loro doc per collection from current SQLite state; SQLite becomes derived — `migrate.test.ts`: the projection of the seeded doc equals the source DB for the 100k fixture.
3. Projection layer: every Loro event applies in one SQLite transaction; a `rederive` command drops and rebuilds SQLite from the docs — `project.test.ts`: rederive equals live DB, including FTS and vectors.
4. Tree edits mapped to `LoroTree` move ops, preserving the P0 fractional indices — `tree.property.test.ts`: no cycles, no orphans, over random concurrent reparents.
5. `SyncTransport` interface plus the fake transport (partition / delay / drop / reorder) and the harness — 3 replicas run deterministically under a fixed seed.
6. **fast-check convergence suite:** random op sequences, random apply orders, 3 replicas, fixed seeds, failures written to `regressions/` — assert `toJSON()` equality and tree integrity.
7. iroh transport with ALPN `/bkm/loro/1` streaming Loro updates — one loopback smoke test plus a real two-machine test.
8. iroh-gossip per-collection topic so any online member relays catch-up — three-machine test (both rigs + a VM): A↔C online, B returns and syncs from C.
9. iroh-blobs for snapshot transfer, sharing BLAKE3 with the P3 snapshot store — `blobs.test.ts`: the same file has the same hash in both stores.
10. Encrypt every Loro update with `K_epoch` before it leaves the process — `syncCrypto.test.ts` plus a packet capture check showing no plaintext.
11. Periodic `export({mode:"shallow"})` to bound document growth — doc size after 50,000 ops recorded and asserted.
12. Invite: `cairn://join/<base58(collectionId ‖ epoch ‖ inviterNodeId ‖ relayHints ‖ expiry ‖ sig)>` registered by the installer, plus a QR rendering — manual: clicked from an email client on both rigs.
13. Sync status indicator — *directe / relayée / hors ligne / en retard* — manual on Wi-Fi and hotspot.
14. Offline catch-up: A does 50 ops offline, B does 50 ops offline, both reconnect → converge — harness plus one real two-rig run.
15. Conflict inspector showing fields whose value lost (audit only, not a merge UI) — manual.
16. Trystero (Nostr strategy) transport for a future browser peer, behind a flag — `trystero.test.ts` room-id hashing only; not shipped enabled.
17. Playwright smoke #10 — two app instances with separate `userData` edit the same collection and converge.

### Automated tests added

**CRDT convergence tests start here** (fast-check, 3 replicas, random partitions, fixed seeds, `regressions/` folder). The P2P harness with partition / delay / drop / reorder. Tree-integrity property tests. Smoke #10.

### Human rig test — P9

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Notes |
|---|---|---|---|---|---|
| 1 | **COLD:** fresh install, click a `cairn://join/...` invite from an email | App opens, shows "X invites you to *Collection* (N links)", joins on accept | click→joined ___ s · protocol handler y/n ___ | click→joined ___ s · protocol handler y/n ___ | |
| 2 | Migrate an existing 100k library to Loro docs | Projection equals the pre-migration DB; no data loss | migrate ___ min · row delta ___ (must be 0) · doc ___ MB | migrate ___ min · row delta ___ · doc ___ MB | |
| 3 | Edit a tree on both rigs simultaneously (drag + rename the same node) | Both converge to the same tree; nothing duplicated or orphaned | converge ___ s · divergent nodes ___ (must be 0) | converge ___ s · divergent nodes ___ | |
| 4 | **SCALE:** live-sync a 20,000-item collection | Memory bounded; sync completes | doc ___ MB · sync RSS ___ MB · full sync ___ s | doc ___ MB · sync RSS ___ MB · full sync ___ s | Sets the per-collection cap |
| 5 | **SCALE:** apply 50,000 ops then take a shallow snapshot | Doc growth bounded after the snapshot | before ___ MB · after ___ MB · snapshot ___ s | before ___ MB · after ___ MB · snapshot ___ s | |
| 6 | One rig offline for 1 h with 50 local edits, then reconnect | Catch-up import fast; all edits present on both sides | catch-up ___ s · edits preserved ___ /50 | catch-up ___ s · edits preserved ___ /50 | |
| 7 | Check the wire with a packet capture during sync | No plaintext bookmark titles or URLs observable | plaintext hits ___ (must be 0) | plaintext hits ___ | |
| 8 | **FAILURE:** one rig on a phone hotspot (symmetric NAT) | Falls back to relay; indicator says "relayée" | hole-punch success y/n ___ · connect ___ s · throughput ___ MB/s | hole-punch y/n ___ · connect ___ s · throughput ___ MB/s | |
| 9 | **FAILURE:** make the relay unreachable and both peers off-LAN | States "hors ligne", queues edits locally, no data loss on reconnect | queued ops ___ · loss on reconnect ___ (must be 0) | queued ops ___ · loss ___ | |
| 10 | **FAILURE:** delete the SQLite index and run `rederive` | Full index rebuilt from the Loro docs, search and map work again | rederive ___ min · row delta ___ (must be 0) | rederive ___ min · row delta ___ | |

**Sign-off:** date ______ · tester ______ · **go / no-go** ______

**Numbers feed back into:** step 4's doc size and RSS set the per-collection item cap surfaced in the UI ("split this collection"); step 8's hole-punch success rate decides whether the v1.5 mailbox node becomes mandatory rather than optional; step 2/10's migrate and rederive times set the acceptable maintenance window.

### Exit criteria

- Migration from SQLite state to Loro docs is lossless and reversible by `rederive`.
- Convergence property tests green across partitions and reorderings, with committed regression seeds.
- No plaintext on the wire; every update sealed under `K_epoch`.
- Offline catch-up preserves every edit on both sides in a real two-machine test.
- Sync status is always one of four honest states, never a spinner.

### What could go wrong

- **Loro's ~20 MB dependency and the projection layer double the debugging surface** (decision 3's stated cost). *Fallback:* the projection is one direction only and `rederive` exists; when a bug is ambiguous, drop SQLite and rebuild.
- **Symmetric NAT defeats hole punching for 5–15% of pairs** (Expert §4, risk #7). *Fallback:* relay; then the v1.5 mailbox node; the UI never claims "peer to peer", it claims "directe / relayée".
- **Doc growth is unbounded** for an active collection. *Fallback:* shallow snapshots on a schedule, plus the per-collection cap set by rig step 4 — never one doc for the whole library.
- **The migration loses a field** nobody notices for weeks. *Fallback:* rig step 2 asserts a zero row delta and a content-hash comparison, not an eyeball check; the pre-migration `library.db` is kept for 30 days.

---

## P10 — global RAG and MCP

**Branch** `v2/p10-global-rag-mcp` · **Duration** 10–15 days · **Depends on** P5 and P1; P9 only for shared collections

**Goal.** Lift retrieval from a selection to the whole corpus (usearch over ~800k chunk vectors, optional reranker), add a conversational surface, and expose the query service over MCP stdio. Also lands the deferred visualisations.

**The one thing that must be true at the end.** Ask a question of the whole 100,000-link library and get a cited answer in under ten seconds — and get the same answer from an external MCP client.

### Deliverables

- `packages/core/src/vec/usearchIndex.ts` — implements P1's `VectorIndex` interface.
- `packages/core/src/rerank/` — Qwen3-Reranker-0.6B ONNX, optional download.
- `packages/core/src/query/` — the transport-agnostic query service.
- `apps/desktop/src/main/mcpServer.ts` — stdio MCP, read tools + a small write set.
- `packages/ui/src/chat/` — `ChatPanel`, `ConversationList`.
- `packages/ui/src/graph/CooccurrenceGraph.tsx` (sigma + graphology, theme-scoped), `packages/ui/src/overlap/OverlapView.tsx` (Observable Plot heatmap + `d3-chord`).
- `docs/mcp.md`.

### Ordered tasks

1. usearch HNSW index over chunk vectors, persisted, `view()` mmap'd, incremental `add()` — build time for 800k recorded; query < 10 ms.
2. Index version stamp (`model_id`, `dim`, extractor version) with an automatic rebuild on mismatch — `usearch.test.ts`: a stale stamp forces a rebuild rather than returning wrong neighbours.
3. Global retrieval: FTS5 BM25 + usearch → RRF → top 30, reusing P1's fusion — `globalRetrieve.test.ts` on a fixed fixture.
4. Optional reranker download and top-30 rerank — the MRR@10 delta versus RRF alone is recorded; this is the evidence decision 5's reverse-if asked for.
5. Conversation memory scoped to a session, with an explicit "effacer / clear" and no cross-session persistence by default — `chat.test.ts`.
6. Context management for a 4B local model versus a cloud model, with the per-turn token budget displayed — `budget.test.ts`.
7. Hallucination guard: any answer with zero citations is labelled "non sourcé / unsourced" — `citations.test.ts`.
8. Transport-agnostic query service (`search`, `getBookmark`, `listThemes`, `treeForQuery`, `askSelection`, `askGlobal`) — `queryService.test.ts` covers each.
9. MCP stdio server wrapping that service: read tools by default, writes (add bookmark, add tag) behind a per-tool toggle that is off by default — manual from an external MCP client.
10. Every MCP call writes an `egress_log` row with the tool name and item count — `egress.test.ts`.
11. Tag co-occurrence graph scoped to one theme's neighbourhood, never the whole library (sigma + graphology) — 20,000 edges at ≥ 30 fps.
12. Overlap / intersection view from an Observable Plot heatmap plus `d3-chord` (UpSet.js remains blocked on its licence) — manual against a known tag pair.
13. Playwright smoke #11 — a global ask over the 100k fixture returns an answer with ≥ 1 resolving citation.

### Automated tests added

usearch index-stamp and rebuild tests. Global retrieval ranking tests. Reranker A/B added to the AI eval harness. MCP tool contract tests. Smoke #11.

### Human rig test — P10

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Notes |
|---|---|---|---|---|---|
| 1 | **COLD:** fresh `userData`, import the 100k fixture, build the chunk index unattended | Build completes; app usable meanwhile | build ___ min · index ___ MB · peak RSS ___ MB | build ___ min · index ___ MB · peak RSS ___ MB | |
| 2 | Ask 10 global questions with the local model | Every answer cites real chunks | retrieval ___ ms · first token ___ s · full ___ s | retrieval ___ ms · first token ___ s · full ___ s | |
| 3 | **SCALE:** run 100 global retrievals back to back | Latency stable; mmap keeps RSS flat | p95 ___ ms · RSS drift ___ MB | p95 ___ ms · RSS drift ___ MB | |
| 4 | Enable the reranker and re-run `npm run eval` | Delta measured either way | Δ MRR@10 ___ · added latency ___ ms · model ___ MB | Δ MRR@10 ___ · added latency ___ ms · model ___ MB | Decides keep/drop |
| 5 | Ask a question the corpus cannot answer | Labelled "non sourcé"; no invented citation | hallucinated y/n ___ | hallucinated y/n ___ | |
| 6 | Connect an external MCP client and run 5 read tools | All 5 return; writes remain disabled by default | latency ___ ms avg · writes exposed ___ (must be 0) | latency ___ ms avg · writes exposed ___ | |
| 7 | Enable one MCP write tool and add a bookmark from the client | The write lands and appears in `egress_log` | ___ s · egress rows ___ | ___ s · egress rows ___ | |
| 8 | Open the co-occurrence graph for the largest theme | Interactive; scoped, not whole-library | nodes ___ · edges ___ · ___ fps | nodes ___ · edges ___ · ___ fps | |
| 9 | **FAILURE:** delete the usearch index file while the app runs, then search | Detected, rebuild offered, global search degrades to doc-level | detect ___ s · rebuild ___ min | detect ___ s · rebuild ___ min | |
| 10 | **FAILURE:** kill the MCP client mid-stream, and run with the network off | No zombie process; local answers still work offline | orphan processes ___ (must be 0) · offline answer y/n ___ | orphan processes ___ · offline answer y/n ___ | |

**Sign-off:** date ______ · tester ______ · **go / no-go — v2 gate** ______

**Numbers feed back into:** step 1's build time and index size decide whether chunk indexing stays opt-in per collection or becomes automatic; step 4's Δ MRR@10 decides whether the reranker ships at all (decision 5 deferred this to measurement); step 3's RSS drift validates the `view()` mmap assumption on a 16 GB M1 holding a model.

### Exit criteria

- 800k-chunk index builds unattended, mmap'd, with a version stamp that forces rebuilds on model change.
- Global ask answers in under 10 s end to end on both rigs, with resolving citations.
- Reranker decision made from measured data and written into `plans/p10-global-rag-mcp.md`.
- MCP server exposes reads by default, writes only per-tool opt-in, everything logged.
- Co-occurrence and overlap views ship theme-scoped, with no banned or unverified-licence dependency.

### What could go wrong

- **usearch is a second native module** with its own prebuild matrix (the reason decision 8 deferred it). *Fallback:* it sits behind the `VectorIndex` interface — if the matrix fights back, keep brute-force chunk search scoped and ship MCP alone.
- **Global chat re-opens the hallucination surface** that scoped RAG contained. *Fallback:* the "non sourcé" label is mandatory, and the default remains the scoped ask.
- **MCP write tools become a foot-gun** on a shared collection. *Fallback:* writes are per-tool, off by default, never available on a collection the user does not own, and always logged.

---

# `plans/SEQUENCING.md`

> Copy the block below to `plans/SEQUENCING.md` in the repo.

```markdown
# Cairn — Development Sequencing & Execution Plan

The canonical order in which the eleven phases get built, and the git workflow around them.
**Point me at this file** (e.g. *"execute P3 per plans/SEQUENCING.md"*) and I will do the phase in
the right order, on the right branch, with the verification gate.

Derived from `plans/research/03-the-pragmatic.md` §16 (phase order) and §17 (testing and the human
rig rule). The governing rule: **the map is the wedge and lands early** (P2, the demo), and
**scoped RAG lands ahead of sync** because sync is the largest remaining risk.

## Git workflow (one branch per phase)

- Long-lived integration branch: `v2-local-first`, cut once from `main`.
- Each phase is developed on **its own branch cut from up-to-date `v2-local-first`**: `v2/p<N>-<slug>`.
- Work inside a phase lands as small, scoped, type-clean commits.
- A phase branch merges into `v2-local-first` **only after the human rig test has been run on BOTH
  rigs (Windows RTX 3050 Ti 4 GB and macOS M1 16 GB) and signed off** in `plans/rig-tests/p<N>-<slug>.md`
  with real measured numbers. No sign-off, no merge.
- The branch is then deleted and the next phase branches from the new `v2-local-first`.
  One phase in flight at a time.
- **`main` is untouched until v1.** At the end of P7, `v2-local-first` merges into `main` once.
- I never merge a phase myself — I implement, self-verify, hand it over for the rig test, and merge
  only on an explicit go.

## Dependency graph (the hard "land-after" edges)

    P0 foundation
     ├──▶ P1 embeddings + hybrid search
     │     ├──▶ P2 clustering + map + stats        ◀── THE 4-WEEK DEMO
     │     │     └──▶ P4 (clusters are what the LLM labels)
     │     ├──▶ P5 ask-this-selection (retrieval + RRF reused verbatim)
     │     └──▶ P6 (768-d vectors travel inside the bundle)
     ├──▶ P3 acquisition + provenance
     │     ├──▶ P4 (there must be text to summarise)
     │     ├──▶ P6 (there must be text to share)
     │     └──▶ P8 (tier contract + router)
     └──▶ P6 identity + bundles (needs the ops/applyOp layer from P0)

    P4 generation + taxonomy ──▶ P5 (the provider chain)
    P0..P6 ──────────────────▶ P7 release  ◀── v1 SHIPS, single merge to main
    P7 ──▶ P8 extension            (pairs with a released, updatable app)
    P6 ──▶ P9 Loro + live sync     (identity, crypto and the op log are its foundation)
    P5 + P1 ──▶ P10 global RAG + MCP

    Soft edge only: P8 before P9 is a preference (ship the cheap thing first), not a dependency.

**Hottest shared surfaces:** `packages/core/src/ops/applyOp.ts` (every phase writes through it),
`packages/core/src/search/rrf.ts` (P1 → P5 → P10), the acquisition router (P3 → P8),
`runs`/diff (P2 → P4). Sequence edits to these before anything that consumes them.

## The phases

### P0 — Foundation · branch `v2/p0-foundation` · 12–18 d
Repo restructure, Electron shell, SQLite schema + `applyOp`, seven importers, i18n, the 100k fixture.
Everything else is a feature on this skeleton. → [plans/p0-foundation.md](p0-foundation.md)

### P1 — Embeddings + hybrid search · branch `v2/p1-embeddings-search` · 8–12 d
The universal substrate: search, clustering, trees and the map all need embeddings; none need generation.
→ [plans/p1-embeddings-search.md](p1-embeddings-search.md)

### P2 — Clustering + map + stats · branch `v2/p2-map-demo` · 10–15 d · **THE DEMO**
The wedge nobody ships, and the morale. If a task here does not move the demo screenshot closer, it
belongs to a later phase. → [plans/p2-map-demo.md](p2-map-demo.md)

### P3 — Acquisition + provenance · branch `v2/p3-acquisition` · 12–18 d
Content acquisition is the hard problem, not AI. Tiers 0–4, 6, 8, rate limits, provenance badges.
→ [plans/p3-acquisition.md](p3-acquisition.md)

### P4 — Generation, summaries, taxonomy, trees · branch `v2/p4-generation-taxonomy` · 15–22 d
Everything the LLM is allowed to do, all of it behind the review queue. Start the Apple enrolment on
day 1 of this phase. → [plans/p4-generation-taxonomy.md](p4-generation-taxonomy.md)

### P5 — Ask this selection · branch `v2/p5-ask-selection` · 6–9 d
The map's payoff, not a competitor to it: retrieval plumbing plus a prompt.
→ [plans/p5-ask-selection.md](p5-ask-selection.md)

### P6 — Identity + bundle sharing · branch `v2/p6-sharing-bundles` · 10–15 d
Sharing that works offline and degrades to "I'll email you the file".
→ [plans/p6-sharing-bundles.md](p6-sharing-bundles.md)

### P7 — Signing, updates, polish · branch `v2/p7-release` · 10–15 d · **v1**
The phase that turns a working app into one a friend can install. Merges to `main`.
→ [plans/p7-release.md](p7-release.md)

### P8 — MV3 extension · branch `v2/p8-extension` · 8–12 d
The only reliable fetcher for logged-in and paywalled content.
→ [plans/p8-extension.md](p8-extension.md)

### P9 — Loro + live sync · branch `v2/p9-loro-sync` · 18–28 d
Replace the merge function, not the data model. The largest remaining risk.
→ [plans/p9-loro-sync.md](p9-loro-sync.md)

### P10 — Global RAG + MCP · branch `v2/p10-global-rag-mcp` · 10–15 d · **v2**
usearch, the optional reranker, the MCP server, and the deferred visualisations.
→ [plans/p10-global-rag-mcp.md](p10-global-rag-mcp.md)

## Rig test records

Every phase's signed record lives in `plans/rig-tests/p<N>-<slug>.md`, from
[plans/rig-tests/TEMPLATE.md](rig-tests/TEMPLATE.md). **The default model and the AI budget caps are
set from those numbers, not from the Expert's estimates.**
```

---

# Milestones

## Milestone 1 — "The 4-week demo" (end of **P2**)

**The screenshot, exactly:** a deck.gl scatterplot of roughly 10,000 of the user's own imported bookmarks, each point coloured by its auto-generated theme (≤ 10 hues plus "autre"), with an active lasso selection drawn over one dense region, and a statistics panel open beside it showing that selection's count, top c-TF-IDF terms, top domains and a date histogram. Centroid labels are visible above the zoom threshold. No LLM, no sharing, no chat is present in the image.

**Honest calendar:** P0 + P1 + P2 is **30–45 working days = 6–9 weeks**, not four. Decision 16's reverse-if ("P2 slips past six weeks → cut the timeline, reduce stats to bare counts, ship the map alone") is therefore *pre-armed*, and there is a cheaper way to reach a true four-week image if the date is what matters:

**The 4-week cut line (≈ 20–24 days).** Keep: Electron shell, schema + `applyOp`, Netscape + Chrome importers, virtualised table, embeddings, sqlite-vec, kNN + Louvain + c-TF-IDF, landmark UMAP, deck.gl scatter + lasso, stats panel. Defer to a later phase: Firefox / Pocket / Karakeep / Raindrop / CSV mapper, the timeline brush, the tree outline, the query-time tree, hybrid RRF (semantic-only search is enough for the image), the export round-trip, and the 100k fixture *as a gate* (still build it, do not block on its perf assertions). This contradicts nothing settled — it is the reverse-if, taken early and deliberately.

## Milestone 2 — "v1 to friends" (end of **P7**)

A notarized macOS build and a Windows NSIS + portable ZIP with a bilingual SmartScreen explainer, auto-updating from GitHub Releases, that a non-technical friend installs and reaches their first search in under ten minutes. Contains: the map, stats, timeline and trees; acquisition tiers 0–4 and 6 with provenance badges; hybrid search; summaries through the provider chain with cloud fallback; tag consolidation and tree reorganisation behind the review queue with 30-day undo; `.bkmshare` encrypted sharing; "Ask this selection"; seven importers and full export; FR + EN; and the egress log as a first-class screen. `v2-local-first` merges into `main` once, here.

## Milestone 3 — "v2" (end of **P10**)

The MV3 extension shipped or sideloadable; Loro live group editing over iroh with gossip catch-up and `cairn://join/` invites; global RAG over ~800k chunks with an optional reranker; the MCP server; the co-occurrence and overlap views. The v1.5 items (mailbox node, Notion import) slot between P7 and P8 if the user asks for them; neither is on the critical path.

---

# `plans/rig-tests/TEMPLATE.md`

```markdown
# Rig test — P<N> <slug>

**Phase branch:** `v2/p<N>-<slug>`
**Build under test:** commit ______ · build type: dev / packaged ______ · version ______
**Date:** ________  **Tester:** ________

## Rigs

| Rig | Spec | OS / build | Notes |
|---|---|---|---|
| Windows | RTX 3050 Ti Laptop 4 GB VRAM + Intel UHD · 32 GB RAM | Windows 11 ______ | |
| macOS | Apple M1 · 16 GB unified | macOS ______ | |

**Preconditions:** `userData` wiped y/n ______ · models present ______ · fixture used ______ ·
network state ______ · power state (AC / battery) ______

## Steps

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Pass? | Notes |
|---|---|---|---|---|---|---|
| 1 | | | | | ☐ | |
| 2 | | | | | ☐ | |
| 3 | | | | | ☐ | |
| 4 | | | | | ☐ | |
| 5 | | | | | ☐ | |
| 6 | | | | | ☐ | |
| 7 | | | | | ☐ | |
| 8 | | | | | ☐ | |
| 9 | | | | | ☐ | |
| 10 | | | | | ☐ | |

Required coverage (tick before signing): one **COLD** case ☐ · one **SCALE** case (100k fixture) ☐ ·
one **FAILURE** case ☐ · every step carries a measured number, never "works/doesn't work" ☐

## Defects found

| # | Step | Severity (blocker / major / minor) | Description | Issue / commit |
|---|---|---|---|---|

## Numbers feed back into

| Measurement | Value (Win / Mac) | Plan decision it updates | Updated? |
|---|---|---|---|
| | | | ☐ |

## Sign-off

**Date:** ________ · **Tester:** ________ · **Result: GO / NO-GO** ________
**If NO-GO:** blocking defects ______ · retest scheduled ______
**Merge to `v2-local-first`:** permitted only on GO. Recorded by ________ on ________
```

---

# Calendar sanity check

| Phase | Days (min–max) |
|---|---|
| P0 foundation | 12–18 |
| P1 embeddings + search | 8–12 |
| P2 map + clusters (**demo**) | 10–15 |
| P3 acquisition | 12–18 |
| P4 generation + taxonomy | 15–22 |
| P5 ask-this-selection | 6–9 |
| P6 identity + bundles | 10–15 |
| P7 release | 10–15 |
| **v1 subtotal (P0–P7)** | **83–124 days** |
| P8 extension | 8–12 |
| P9 Loro + live sync | 18–28 |
| P10 global RAG + MCP | 10–15 |
| **v2 subtotal (P8–P10)** | **36–55 days** |
| **Total (P0–P10)** | **119–179 days** |

At five working days per week:

- **Demo (P0–P2):** 30–45 days = **6–9 working weeks**. The "4-week demo" name is only reachable via the cut line above; otherwise decision 16's reverse-if fires at the top of the range.
- **v1 (P0–P7):** 83–124 days = **~17–25 working weeks** (4–6 months of full-time solo work).
- **v2 (P8–P10):** 36–55 days = **~7–11 working weeks**.
- **Everything:** 119–179 days = **~24–36 working weeks**.

**Buffers not in the table.** (a) Each phase's rig-test *day* is included, but a NO-GO retest loop is not — budget one extra day per phase on average, ~11 days total. (b) Electron's 8-week Chromium train costs about half a day per quarter (decision 13) — ~3 days across v1+v2. (c) Apple enrolment and any OV certificate purchase are wall-clock, not effort: start the Apple enrolment at the beginning of P4. A **15% contingency** on the totals is the honest planning number: **v1 ≈ 19–29 weeks**, everything **≈ 28–41 weeks**.

**The three phases most likely to overrun**

1. **P4 (15–22 d) — generation, summaries, taxonomy and trees.** It is four subsystems in one phase (the provider chain with four backends and a native download, cluster labelling, tag consolidation, tree materialisation with stable ids) plus the review queue that all of them must pass through, on a 4 GB VRAM ceiling, with an overnight run in the middle of the feedback loop. Every Expert risk that is rated High-or-worst (#3 local summarisation at scale, #4 VRAM, #5 CUDA prebuilds, #10 auto-reorganisation destroying trust) lands here. *Contain it by:* keeping Ollama as the only provider until every taxonomy task is done, and deferring the local AI pack download to the last three days of the phase — if it slips, it slips alone and P5 is not blocked.
2. **P9 (18–28 d) — Loro and live sync.** The widest range in the plan, and deliberately so: a migration, a projection layer, a CRDT model, three transports, an encryption seam, and a NAT-traversal failure mode that only appears on someone else's network. Convergence bugs are found by property tests at a rate that is genuinely hard to estimate. *Contain it by:* landing the migration + projection + fast-check suite as a mergeable half (SQLite still authoritative, Loro shadow-written) before touching any transport.
3. **P3 (12–18 d) — acquisition.** Forty golden fixtures against a live, hostile, constantly-changing web; the hidden `BrowserWindow` tier; robots and rate-limit correctness that only shows up over hours; and a success rate (rig step 4) that can itself force the P8 extension into v1 and lengthen v1 by another 8–12 days. *Contain it by:* time-boxing the golden-fixture set at 40 and treating anything below 75% as a decision to record, not a problem to fix inside the phase.

**Honourable mention — P7 is a calendar risk, not an effort risk.** Ten to fifteen days of work, but gated on Apple enrolment, notarization round-trips and possibly a hardware-token certificate order from an EU CA. It is the one phase where working faster does not help, which is why the enrolment starts in P4.
