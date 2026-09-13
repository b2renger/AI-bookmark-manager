# Cairn — Milestones and calendar

## Milestone 1 — "The 4-week demo" (end of **P2**)

**The screenshot, exactly:** a deck.gl scatterplot of roughly 10,000 of the user's own imported bookmarks, each point coloured by its auto-generated theme (≤ 10 hues plus "autre"), with an active lasso selection drawn over one dense region, and a statistics panel open beside it showing that selection's count, top c-TF-IDF terms, top domains and a date histogram. Centroid labels are visible above the zoom threshold. No LLM, no sharing, no chat is present in the image.

**Honest calendar:** P0 + P1 + P2 is **30–45 working days = 6–9 weeks**, not four. Decision 16's reverse-if ("P2 slips past six weeks → cut the timeline, reduce stats to bare counts, ship the map alone") is therefore *pre-armed*, and there is a cheaper way to reach a true four-week image if the date is what matters:

**The 4-week cut line (≈ 20–24 days).** Keep: Electron shell, schema + `applyOp`, Netscape + Chrome importers, virtualised table, embeddings, sqlite-vec, kNN + Louvain + c-TF-IDF, landmark UMAP, deck.gl scatter + lasso, stats panel. Defer to a later phase: Firefox / Pocket / Karakeep / Raindrop / CSV mapper, the timeline brush, the tree outline, the query-time tree, hybrid RRF (semantic-only search is enough for the image), the export round-trip, and the 100k fixture *as a gate* (still build it, do not block on its perf assertions). This contradicts nothing settled — it is the reverse-if, taken early and deliberately.

## Milestone 2 — "v1 to friends" (end of **P7**)

A notarized macOS build and a Windows NSIS + portable ZIP with a bilingual SmartScreen explainer, auto-updating from GitHub Releases, that a non-technical friend installs and reaches their first search in under ten minutes. Contains: the map, stats, timeline and trees; acquisition tiers 0–4 and 6 with provenance badges; hybrid search; summaries through the provider chain with cloud fallback; tag consolidation and tree reorganisation behind the review queue with 30-day undo; `.bkmshare` encrypted sharing; "Ask this selection"; seven importers and full export; FR + EN; and the egress log as a first-class screen. `v2-local-first` merges into `main` once, here.

## Milestone 3 — "v2" (end of **P10**)

The MV3 extension shipped or sideloadable; Loro live group editing over iroh with gossip catch-up and `cairn://join/` invites; global RAG over ~800k chunks with an optional reranker; the MCP server; the co-occurrence and overlap views. The v1.5 items (mailbox node, Notion import) slot between P7 and P8 if the user asks for them; neither is on the critical path.

## Calendar sanity check

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
