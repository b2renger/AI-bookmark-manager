> Part of the Cairn v2 plan. Read `plans/SEQUENCING.md` first, then this file, then the previous phase's rig-test record in `plans/rig-tests/`. Durations are working days for a solo developer. Decisions referenced as "decision N" live in `plans/research/03-the-pragmatic.md`.

# P2 — clustering, map and statistics (**the demo**)

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
