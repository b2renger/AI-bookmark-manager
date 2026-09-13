> Part of the Cairn v2 plan. Read `plans/SEQUENCING.md` first, then this file, then the previous phase's rig-test record in `plans/rig-tests/`. Durations are working days for a solo developer. Decisions referenced as "decision N" live in `plans/research/03-the-pragmatic.md`.

# P1 — embeddings and hybrid search

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
