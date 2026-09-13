> Part of the Cairn v2 plan. Read `plans/SEQUENCING.md` first, then this file, then the previous phase's rig-test record in `plans/rig-tests/`. Durations are working days for a solo developer. Decisions referenced as "decision N" live in `plans/research/03-the-pragmatic.md`.

# P10 — global RAG and MCP

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
