> Part of the Cairn v2 plan. Read `plans/SEQUENCING.md` first, then this file, then the previous phase's rig-test record in `plans/rig-tests/`. Durations are working days for a solo developer. Decisions referenced as "decision N" live in `plans/research/03-the-pragmatic.md`.

# P5 — ask this selection

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
