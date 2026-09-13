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
