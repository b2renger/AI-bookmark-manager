> Part of the Cairn v2 plan. Read `plans/SEQUENCING.md` first, then this file, then the previous phase's rig-test record in `plans/rig-tests/`. Durations are working days for a solo developer. Decisions referenced as "decision N" live in `plans/research/03-the-pragmatic.md`.

# P4 — generation providers, summaries, taxonomy and trees

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
