# The Pragmatic — Decision Record

**2026-09-12. Status: settled.** The Planner and The Builder treat everything below as fixed unless a "Reverse if" trigger fires. Where The Doubtful and The Expert disagreed, the adjudication is in the *Weighed* block.

## Decisions at a glance

| # | Decision | Choice |
|---|---|---|
| 1 | Build / fork / client | **Build** on our own repo. Import Karakeep files; don't be its client. MCP in v2. |
| 2 | Sharing | **Staged:** v1 encrypted `.bkmshare` bundles → v1.5 mailbox node → v2 Loro live sync. |
| 3 | CRDT timing | **SQLite first**, Loro-shaped schema + op log from day one. Loro at v2. |
| 4 | AI runtime | **Bundle ONNX embeddings**; generation pluggable, `node-llama-cpp` **downloaded on demand**. |
| 5 | Models & budget | EmbeddingGemma-300M, **768-d stored / 256-d indexed**; Qwen3.5-4B Q4_K_M; **no reranker v1; no LLM on the save path**. |
| 6 | Cloud | Default **none**. Haiku 4.5 bulk, Gemini 3.8 Flash grounding. Free-tier Gemini = blocking warning + metadata-only. |
| 7 | Acquisition | Tiers 0–4 + 6 in v1 (**hidden BrowserWindow yes**); extension v1.5; snapshots opt-in, 5 GB LRU. |
| 8 | Database | Expert's SQLite+FTS5+sqlite-vec, **3 amendments**: 768-d BLOB, `ops`/`runs`, usearch deferred. |
| 9 | Clusters & trees | Louvain + c-TF-IDF + LLM-per-cluster. **Review queue mandatory. Persistent AND query-time trees.** |
| 10 | Viz v1 | Map + selection stats + timeline + indented tree. **Cosmograph banned; UpSet.js blocked.** |
| 11 | RAG v1 | **"Ask this selection" only** (≤500 chunks, brute force, citations). Global chat v2. |
| 12 | Import/export | 7 importers v1 + generic CSV mapper. **Notion v1.5, one data source, no recursion.** |
| 13 | Shell & signing | Electron 44.x as artlux. **Apple €99/yr now; Windows OV ~€130–400/yr later.** Intel Mac best-effort. |
| 14 | Repo | Branch `v2-local-first`, phases `v2/pN-slug`, npm workspaces. Name: **Cairn**. |
| 15 | Privacy | Keys in `safeStorage` day one; **no full-DB encryption v1**; exclusion list + `egress_log` screen. |
| 16 | Scope | 4-week demo = **the map**. v1 adds fetch, search, summaries, trees, bundles, ask-selection. |
| 17 | Testing | Vitest + 100k fixture + Playwright `_electron` from P0. **Human rig test gates every merge.** |

---

## 1. Build vs fork vs be-a-client

**Choice.** Build, on a new branch of the user's own repo. Do not fork Karakeep. Do not be a live client of Karakeep/Raindrop/Linkwarden — consume their *export files* as importers. Expose our own MCP server (stdio, read + a few writes) in v2, as a thin wrapper over a transport-agnostic query service.

**Weighed.** Karakeep is Next.js + Postgres/Meilisearch + Puppeteer: server-shaped, account-shaped, AGPL. Grafting Electron, local-first storage and a GPU map onto it costs more than writing the map from scratch — both personas agree and I confirm. Being a *live* client sounds cheap but makes the app useless unless the friend also runs a server, which this audience will not. MCP export is cheap once search exists, but not worth blocking v1.

**Reverse if.** Karakeep ships an embedding map plus cluster statistics before our P2 demo lands — the wedge is gone, and the honest move is a Karakeep companion, not a competitor.

## 2. Sharing model

**Choice.** Three stages. **v1: encrypted share bundles.** A share is one `.bkmshare` file — JSONL records, extracted text, precomputed embeddings, optional snapshots — sealed with XChaCha20-Poly1305 under a per-collection key, that key wrapped per member X25519 pubkey, the whole signed Ed25519. Transport is whatever the friends already use (Signal, email, WeTransfer, USB), plus in-app iroh direct transfer when both are online. A read-only subscription = the publisher re-exports; the receiver merges by op-log, not overwrite. **v1.5: one mailbox node** — the same app run `--headless` on a Pi or €5/mo VPS, storing sealed blobs it cannot read. **v2: Loro live sync** over iroh for group-edited collections.

**Weighed.** The Expert's full stack (Loro + iroh + gossip + Nostr mailbox + home node) is four to eight weeks plus a permanent support surface, for an audience whose realistic use is "here are 40 links about X". The Doubtful is right that simultaneity, not NAT, is the binding constraint. Git-as-sync needs a GitHub account and a model of merge conflicts from people who have neither. Bundles take one to two weeks, work offline, and degrade to "I'll email you the file". Cost: no live co-editing, no revocation once read.

**Designed in from day one so v2 is not a rewrite.** (a) UUIDv7 ids everywhere, no exposed autoincrement PKs. (b) All mutations through one `applyOp(op)` layer writing an append-only `ops` table stamped `(actor_pubkey, HLC)`, last-writer-wins per field — Loro later replaces the *merge function*, not the data model. (c) `collection_id` on every shareable row. (d) Tree edits as move-ops `(nodeId, parentId, fractional_index)`, matching LoroTree semantics. (e) Snapshots content-addressed by BLAKE3, so the bundle store and a future iroh-blobs store are one store. (f) Ed25519 identity + per-collection `K_epoch` with rotation.

**Reverse if.** Two friends independently edit one collection and hit a lost update during dogfooding within three months — pull Loro forward a phase.

## 3. CRDT adoption timing

**Choice.** SQLite is the source of truth in v1, with the Loro-compatible schema and op log above. Loro (`loro-crdt`, one doc per collection, `LoroTree` for the hierarchy) is adopted in v2, seeded from SQLite state.

**Weighed.** "Loro authoritative, SQLite derived" is the right *end state*; I dispute only timing. In phase 1 it puts a ~20 MB wasm dependency and a projection layer on the critical path of importing 100k links, doubles the debugging surface of every early bug, and buys nothing while sharing is non-concurrent. With no concurrent history to preserve, migration is cheap: fresh doc per collection, insert state, peers join — but only if decision 2's invariants hold.

**Reverse if.** The op-log LWW merge exceeds ~300 lines or needs per-type conflict rules — that is Loro asking to be adopted early, and obeying beats reimplementing it badly.

## 4. Local AI runtime

**Choice.** Split the runtime, and split the *shipping* decision with it. **Bundled:** `onnxruntime-node` + EmbeddingGemma-300M ONNX q8 (~200 MB model fetched on first run). Embeddings are the universal substrate — search, clustering, trees and map all need them, none need generation — so they are never optional. **Not bundled:** `node-llama-cpp`. Generation is a `GenerationProvider` interface with four backends, probed in order: (1) detected Ollama or LM Studio, (2) an optional "local AI pack" — node-llama-cpp with Vulkan/Metal/CPU prebuilds, downloaded in-app with a progress bar on first use, (3) a cloud key, (4) extractive-only. Inference runs in a `utilityProcess`; embeddings stay on CPU whenever an LLM is resident (4 GB will not hold both).

**Weighed.** The Doubtful's "generation entirely external" leaves a non-technical friend with no summaries at all, breaking the headline promise. The Expert's "bundle node-llama-cpp" pushes the installer from ~90 MB to ~250–400 MB, puts a three-platform native matrix on the phase-1 critical path, and ships CUDA binaries needing a Toolkit nobody has. The compromise costs one download dialog — already accepted for the GGUF — and keeps the native matrix off phase 1. Ollama with 15 models already wins path (1) on the dev machine.

**Reverse if.** Download-on-demand fails twice in rig tests on a friend's Windows machine (antivirus, proxy, SmartScreen on the binary) — then bundle Vulkan+Metal+CPU and eat the 300 MB.

## 5. Default models and AI budget policy

**Choice. Embeddings:** EmbeddingGemma-300M ONNX q8. **Store the full 768-d vector as BLOB; index the Matryoshka-truncated, re-normalised 256-d in sqlite-vec.** Every row carries `model_id` and `dim`. **Generation:** Qwen3.5-4B-Instruct Q4_K_M at 4K context; Gemma 4 E2B Q4 on low-VRAM or battery; probe VRAM at startup, user-overridable. **Reranker: no in v1.** **Budget, four tiers:**

- *Save path* (synchronous, <2 s, zero LLM calls — an invariant): normalise URL, fetch tiers 0–2, extract, detect language, extractive 3-sentence lead, embedding keyphrases, doc + chunk embeddings, FTS index, nearest-theme assignment.
- *Background queue* (visible, pausable, throttled; pauses on battery, thermal, active typing): summaries for a prioritised subset only — opened twice, starred, active collection, newest N. Default cap 300 calls/night.
- *Explicit user action:* "Reorganise my library" (the ~2,000-call run), "Summarise this collection", bulk re-summarise, RAG answers.
- *Propose the cloud* at two moments only: a job whose local ETA exceeds two hours, priced as "local ≈ 9 h 20 / Haiku Batches ≈ 1 h, ≈ 3 €"; or an item where local structured output failed twice.

**Weighed.** 256-d cuts memory two-to-threefold and keeps sqlite-vec brute force under 100 ms at 100k, which is why no ANN index is needed; but re-embedding 100k docs later is a nine-hour penance, so storing 768 (~300 MB) turns that into a reindex. The reranker is 350–600 MB and ~50 ms/query for a gain over RRF nobody has measured here. Both personas converge on "never an LLM call on save"; I elevate it to an invariant enforced in code.

**Reverse if.** MRR@10 < 0.6 with RRF alone → add the reranker. Or 256-d recall@10 more than five points below 768-d → flip the index to 768-d (a reindex, not a re-embed).

## 6. Cloud providers

**Choice.** Default provider on first run: **none** — the app is fully useful with zero keys. When keys exist: **`claude-haiku-4-5`** for bulk and structured work (Batches at 50%, not used for training, 7-day retention); **`gemini-3.8-flash`** for grounded extraction of URLs the fetch pipeline failed, since `googleSearch` grounding is a Gemini-only capability the existing code depends on. Move the hardcoded model id to config. A free-tier Gemini key triggers a blocking modal with an unchecked box stating in plain FR/EN that free-tier content may train Google's models and may be seen by human reviewers; unchecked restricts that provider to URL + title. **Default egress scope, even with keys: URL + title + at most 2,000 characters of extracted text.** Snapshots, full PDFs, notes, embeddings and the tag vocabulary never leave without a per-action confirmation naming what is sent.

**Weighed.** Both providers are required by the user, so this is about defaults and blast radius, not selection. Anthropic's retention posture is the better default for content; Gemini's grounding is irreplaceable for the "URL that refuses to be fetched" case the old app was built around. The 2,000-character cap is arbitrary but is the difference between "a summary request" and "my library is in someone's logs", and it is one config line to raise.

**Reverse if.** Grounded extraction is under ~5% of successful acquisitions once tiers 0–4 ship → demote Gemini to opt-in, leaving Anthropic the only default.

## 7. Content acquisition

**Choice.** v1 ships the Expert's §6 tiers **0** (structured APIs), **1** (YouTube/X/Threads shims — ports of existing code), **2** (undici + defuddle → readability), **3** (PDF via unpdf; OCR behind a flag), **4 — the hidden `BrowserWindow`, yes, in v1**, **6** (Wayback) and **8** (graceful failure: URL + OG + low confidence, never a hard error). Tier **7** (cloud extraction) ships present but off. **The MV3 extension is v1.5.** robots.txt respected for tiers 2 and 4, with a per-domain override that writes a log line. Rate limit 1 req / 2 s per hostname with jitter, concurrency 4, **bulk backfill capped at 2,000 URLs/day and explicitly started**. Snapshots: **opt-in per collection, off by default**, 2 MB/page after zstd, 5 GB LRU store, never in a bundle unless the user confirms the size.

**Weighed.** Tier 4 is ~150 lines in Electron with a real profile and residential IP, covers most of what tier 2 misses, and is the strongest argument for choosing Electron at all — cutting it undermines decision 13. The extension is a second product: an MV3 build, a localhost handshake, and store review or sideload instructions for people who don't know what "developer mode" means. It is the only answer for paywalled content, so it is scheduled, not dropped. The rate cap is conservative because bulk re-crawling from home is how the home IP gets blocked.

**Reverse if.** Tier 2+4 success on the real corpus falls below ~75% → pull the extension into v1; the missing quarter *is* the corpus.

## 8. Database

**Choice.** Confirm the Expert's SQLite (better-sqlite3, WAL) + FTS5 (`unicode61 remove_diacritics 2`) + sqlite-vec (doc-level, exact) + content-addressed zstd snapshot files, with **three amendments**: (a) embeddings stored full-precision 768-d as BLOB, indexes disposable; (b) add append-only `ops` and `runs` tables, making the CRDT seam and the undo unit explicit in the schema; (c) **usearch deferred to v2** — v1 chunk search is scoped to a collection or selection, brute force from BLOBs, needing no second native module in phase 1. Pragmas as specified.

**Entities.** `bookmarks`; `content_versions` (one per fetch — method/tier, http_status, lang, text, text_hash, snapshot_hash, confidence, confidence_reason: provenance lives here); `chunks` (heading_path, char offsets); `embeddings` (owner_type, owner_id, model_id, dim, vec BLOB); `tags`, `tag_aliases`, `bookmark_tags` (`source` ∈ user|import|ai, `accepted`); `themes` (resolution, bilingual label, emoji, centroid, parent_id, run_id); `theme_assignments` (score, margin); `tree_nodes` (collection_id, parent_id, frac_index, kind ∈ theme|query|pin|folder, ref_id, pinned); `collections` (visibility, epoch, key_ref); `members` (pubkey, name, role, epoch_granted); `feedback_events`; `jobs`; `runs`; `ops`; `egress_log`; `settings`.

**Weighed.** Nothing in the Expert's storage analysis needs overturning. The amendments are about sequencing risk: every native module in phase 1 is a prebuild matrix across four targets, and usearch earns its place only when global chunk search ships. Making `ops` and `runs` first-class turns "undo" and "future CRDT" from aspirations into schema.

**Reverse if.** Brute-force chunk search over a realistic selection exceeds 150 ms p95 → pull usearch forward.

## 9. Clustering, trees, tag reorganisation

**Choice.** Adopt the Expert's §7 and §10 pipelines unchanged (kNN graph → multi-resolution Louvain → c-TF-IDF → one LLM call per cluster for bilingual labels → sibling dedupe → zero-LLM centroid assignment → LLM only on the ambiguous tail; tag consolidation by embed → merge at cosine ≥ 0.88 → Jaccard < 0.05 homonym guard → LLM adjudication). UMAP is for the map and never touches clustering.

**The review rule (non-negotiable).** Every AI run creates a `run` row and a **diff**. Nothing that changes user-visible structure or tags applies until accepted, per-item or bulk. "Undo this run" reverts atomically for 30 days. The only permitted auto-apply is additive and reversible: assigning a *new* bookmark to an *existing* theme, and attaching AI tags with `accepted=false` in a distinct style.

**Trees — both, sharing one node model.** A **persistent tree per collection**: the materialised hierarchy, versioned per run, where drags, renames and pins survive regeneration by stable node id matched old→new via centroid similarity, depth capped at 4. Plus **query-time disposable trees**: `tree(query)` from cached cluster labels over the top-N results, never persisted *until the user pins a branch*, which copies it in as `kind=pin`.

**Weighed.** This reconciles the Doubtful's disposable projection with the Expert's materialised LoroTree. Purely disposable fails the Pearltrees promise — the user wants a place that looks the same tomorrow. Purely persistent fails "themes depending on context". Pinning is the bridge, at the cost of one node kind. An auto-reorganiser that silently rewrites a 100k-link library once gets switched off forever; hence the review queue.

**Reverse if.** The user accepts >95% of proposed merges across three consecutive runs → allow opt-in auto-apply above a confidence threshold, still logged and undoable.

## 10. Visualization set

**Choice. v1:** (1) the **2D embedding map** — deck.gl `ScatterplotLayer`, landmark-UMAP positions precomputed in a Worker and stored as `x,y` in SQLite, `HexagonLayer` at low zoom, coloured by theme (≤10 hues + "autre"), GPU picking, lasso selection, centroid labels above a zoom threshold; (2) a **selection statistics panel** — count, top c-TF-IDF terms, top domains, date histogram, top tags, confidence distribution; (3) a **timeline** (Observable Plot) whose brush filters the map; (4) an **indented collapsible tree outline**. **Later:** tag co-occurrence graph (sigma + graphology, scoped to one theme, never the whole library), intersection/overlap analysis, radial and treemap trees.

**Licensing, binding.** Cosmograph **banned** (CC-BY-NC-4.0). UpSet.js **blocked** pending license verification — build overlap views from Observable Plot heatmaps + `d3-chord`. New viz dependencies must be MIT / Apache-2.0 / ISC / BSD. Do not require WebGPU; WebGL2 is the floor.

**Weighed.** Both personas independently name visual exploration as the empty quadrant, so v1 must contain enough of it to *be* the product rather than tease it; map + stats + timeline is that minimum, and it is the demo. Overlap views are valuable (InfraNodus-style structural gaps) but are a second interaction model, sitting on a tag vocabulary that stays dirty until consolidation has run once.

**Reverse if.** deck.gl cannot hold 60 fps with 100k points on the reference laptop's Intel UHD → fall back to `regl-scatterplot` and density-sample the rendered set.

## 11. RAG in v1

**Choice.** Yes, in one minimal form: **"Ask this selection"**. Scope is a lasso selection, a collection or a saved group; ≤500 chunks; FTS5 BM25 (k=50) + brute-force exact vector (k=50) fused with RRF → top 6–8 chunks; citations as `[[c:<chunkId>]]` rendered as chips linking to `bookmark#charStart`; context ≤3,000 tokens for a 4B model. With no generation provider the same pipeline runs and shows ranked passages — useful without an LLM. **Not in v1:** global corpus RAG, conversational memory, agentic tools, reranker, usearch.

**Weighed.** The Doubtful says RAG is commoditised and the map should ship before the chat — both true. But scoped ask-this-selection is the map's *payoff*, not a competitor: once embeddings, chunks and FTS exist it is retrieval plumbing plus a prompt, and it directly answers the stated "local RAG over a group of links". Global chat is where the cost lives — usearch, reranker, context management, hallucination surface — and that defers.

**Reverse if.** Grounded answers over a 500-chunk selection with a 4B local model score below ~70% acceptable in the eval harness → ship ranked-passages-only and hold generated answers for a cloud or 8B path.

## 12. Import / export

**Choice. v1 importers:** Netscape HTML (folders → tags; port the existing parser), Chrome/Edge/Brave live JSON, Firefox `places.sqlite` (both copy-then-read), Raindrop CSV, Karakeep JSON, Pocket legacy ZIP/CSV, and a **generic CSV column mapper** — the mapper covers the long tail for less code than any two specific importers and is reused by Notion. Imports run in one `db.transaction()`, produce a dedupe report by normalised URL *before* commit, then enqueue background work.

**Notion: v1.5, deliberately narrow.** Import from **one chosen data source** using `Notion-Version: 2025-09-03` (resolve `database → data_sources[]`, query by `data_source_id`, ~3 rps), mapping properties through the same column-mapper UI, pulling page properties plus the first N blocks as a note. **No relations, rollups, formulas, file downloads or recursive workspace walk.** `notionService.ts` becomes the client and needs the data-sources migration regardless.

**Export:** one "Export everything" → `bookmarks.json` (full-fidelity round-trip — this is the contract), `bookmarks.html` (Netscape), `markdown/` (Obsidian-compatible), a `library.db` copy, `snapshots/` if present. All streamed. Document a plain `sqlite3` recovery recipe so export never depends on the app being healthy.

**Weighed.** The user explicitly asked for Notion import, so it is placed, not dropped — but the Doubtful's warning is correct and specific: no export endpoint, a slow recursive block walk, dropped relations and formulas, expiring file links, and a $5,000 Obsidian bounty still open on the problem. One data source plus a mapper turns a multi-week trap into two or three days.

**Reverse if.** The user's Notion content is nested pages rather than a table → the honest answer is "export Markdown from Notion, import the folder", which the Obsidian path already handles.

## 13. Shell, packaging, signing, updates

**Choice.** Electron **44.x** (follow the 8-week train; pin a minor, budget half a day per quarter for the Chromium bump), `electron-vite` 5 + `electron-builder` 26 + `electron-updater`, mirroring artlux's `src/main | src/preload | src/renderer` split and its `autoDownload:false`, IPC-driven update flow. `nodeIntegration` off, `contextIsolation` and `sandbox` on, narrow `contextBridge` — this app renders hostile HTML by definition. Targets: Windows NSIS x64 + portable ZIP; macOS arm64 dmg; Linux AppImage + .deb. A throwaway unsigned build must be installed on both rigs at the end of phase 0.

**Signing, plainly.** **macOS: buy the Apple Developer Program, €99/year, before the first build goes to a friend** — without notarization a friend's Mac refuses to open the app, and no non-technical person will perform the workaround. **Windows: ship unsigned NSIS + portable ZIP + a bilingual SmartScreen explainer at first (€0), then buy an OV certificate on a hardware token (≈ €130–400/year; Certum's individual line is the usual EU answer, pricing unverified) once there are more than about three non-technical Windows users.** EV (≈ €400–600/year) only if SmartScreen friction actually stops someone; Azure Artifact Signing is likely ineligible from France; Linux €0. **Realistic recurring cost: €99/year in year one, rising to roughly €230–500/year.** This is the one line that cannot be engineered away.

**Intel Mac.** Build `darwin-x64` best-effort: everything works except iroh direct transfer (no darwin-x64 prebuild), degrading to file-based bundles — acceptable precisely because decision 2 made bundles the v1 path. Drop it the moment it costs more than a CI line.

**Weighed.** Electron over Tauri is settled by the hidden-BrowserWindow requirement, the native-module story, Playwright `_electron` support, and the absence of a Rust toolchain here. artlux proves the chain works for this dev; its gaps — unsigned Windows, ad-hoc macOS, the fuses-vs-signature tripwire caught by `scripts/verify-mac-signature.cjs` — are the mitigations to copy.

**Reverse if.** Notarization is repeatedly rejected or the OV token process stalls beyond a month → ship portable/AppImage-only rather than delaying v1.

## 14. Repo strategy and naming

**Choice.** Long-lived integration branch **`v2-local-first`**; per-phase branches **`v2/p<N>-<slug>`** merged into it only after the human rig test passes (artlux `plans/SEQUENCING.md` discipline); `main` untouched until v1 ships, then one merge. npm workspaces (Node 24 / npm 11 — delete `bun.lock`, no pnpm):

```
apps/desktop      Electron: src/main, src/preload, src/renderer
apps/extension    MV3 — placeholder in v1, built in v1.5
packages/core     runtime-agnostic TS: schema, ops, extraction, clustering,
                  search, bundle format — NO `node:` imports
packages/ui       React components ported from the old app
legacy/           the current app; deleted at the end of phase 0
plans/            SEQUENCING.md + per-phase plans + rig-test records
docs/
```

**Delete:** localStorage persistence, the CDN importmap and Tailwind CDN (→ PostCSS), the `vite.config.ts` API-key `define`, public CORS proxy presets, `ApiKeySetup.tsx`, the duplicate root `Header.tsx`, the 14 `test-*` files, the X bearer-token flow, `.idx/`. **Add `.env` to `.gitignore` and rotate the Gemini key — it may be in git history.** **Keep and port** exactly what the inventory lists (`stripUtmParams` + dedupe, Netscape parser, the four context extractors and server-side post-processing, `BookmarkList` filters, `EditableField`/`ConfidenceBadge`/`PlatformBadge`, `BulkActionBar`, `Icons`, `notionService`, the exporters, the `Bookmark` shape as schema seed).

**Name (check trademark / npm / domain first):** **1. Cairn** — identical in French and English, five letters, a stone marker left on a path; `cairn://join/...` reads well as a protocol handler. *Recommended default.* **2. Marelle** — French hopscotch, jumping between linked squares. **3. Herbier** — pressed, labelled specimens; "herbarium" carries in English.

**Weighed.** Workspaces inside one repo respect the fixed "new branch in AI-bookmark-manager" decision while keeping `packages/core` free of `node:` imports — preserving the PWA and extension options and making core unit-testable without Electron. Keeping `legacy/` for one phase lets the port reference working code while replacing it.

**Reverse if.** The layout fights electron-vite's native-module handling for more than a day → collapse to one package with `src/core`, keeping the import discipline as a lint rule.

## 15. Privacy posture

**Choice. Secrets encrypted from day one** — API keys, the Ed25519 identity private key and per-collection keys through Electron `safeStorage` (DPAPI / Keychain / libsecret). **No full-database encryption in v1:** SQLCipher means forking the better-sqlite3 build matrix and paying 5–15% on every query, against a threat model it barely changes. "Lock library" — passphrase-encrypted at rest — is v2. **Default domain exclusion list** as an editable data file: banking, health, webmail, cloud drives, `localhost`, private IP ranges, `*.local`; matches store URL + title only, never fetched, never sent to a cloud provider. **The `egress_log` is a first-class screen**, not a settings sub-page: timestamp, destination host, purpose, item count, bytes, collection. Every cloud call, third-party fetch and peer transfer writes a row; exportable. **P2P disclosure**, shown once before the first direct share and linked from the sharing screen, in plain FR/EN: *"When you share directly with a friend, your computer and theirs exchange IP addresses, possibly through a relay server run by a third party. Your friend — and that relay — can see roughly where you are connecting from. Sharing by file does not do this."*

**Weighed.** The Doubtful calls encrypted-at-rest table stakes; I agree on principle, disagree on sequencing. What actually costs something when leaked — a key that costs money, an identity key that lets someone impersonate you in a group — is protected on day one at near-zero cost. Encryption that unlocks automatically at login protects against a stolen laptop, not malware, so v1 uses OS file permissions and v2 adds an explicit passphrase.

**Reverse if.** The app gains any "sync my whole library to a node I don't control" feature — at-rest encryption then moves into that same phase.

## 16. Scope cut

**MVP — the 4-week demo. One screenshot:** *a deck.gl scatterplot of roughly 10,000 of the user's own imported bookmarks, coloured by auto-generated theme, with an active lasso selection and a statistics panel showing that selection's top terms, top domains and date histogram.* Required: Electron shell, SQLite + FTS5, Netscape/Chrome import, embeddings, landmark UMAP, Louvain, c-TF-IDF, deck.gl. **No LLM, no sharing, no RAG in the demo.**

**v1 — what friends install.** MVP plus acquisition tiers 0–4 and 6 with provenance badges, hybrid search, tag consolidation behind the review queue, persistent and query-time trees, summaries via the provider chain, cloud fallback, `.bkmshare` sharing, "Ask this selection", seven importers, full export, FR/EN, a notarized macOS build, auto-update, the egress log.

**v2.** Loro live group editing, iroh gossip, the mailbox node, the MV3 extension, global RAG/chat, reranker, usearch, co-occurrence and overlap views, Notion import if it slipped, the MCP server, "Lock library".

**Explicitly never (for now).** Mobile apps. Custom networking beneath iroh. A hosted service or user accounts. Recursive Notion workspace import. Fine-tuning. Server-side crawling. Federation beyond the mailbox. And **"full editing of the whole database"** as an arbitrary grid over every table — replaced by three cheaper things that deliver the intent: a filterable, bulk-editable bookmark table; a read-only SQL console with CSV export; a lossless JSON round-trip.

**Phase order** (reconciling the Expert's risk-#1 ordering with the Doubtful's traps): P0 repo/shell/DB/import/i18n → P1 embeddings + hybrid search → **P2 clustering + map + stats = the demo** → P3 acquisition + provenance → P4 generation providers + summaries + tag consolidation + trees → P5 ask-this-selection → P6 identity + bundle sharing → P7 signing, updates, polish → **v1** → P8 extension → P9 Loro + live sync → P10 global RAG + MCP. Two deliberate deviations: the map moves *earlier* (the wedge, and the morale), and scoped RAG moves *ahead of* Loro/P2P (nearly free, headline ask, while sync is the largest risk left).

**Reverse if.** P2 slips past six weeks → cut the timeline, reduce stats to bare counts, ship the map alone. The demo existing matters more than the demo being complete.

## 17. Testing and quality bar

**Choice. Mandatory from P0:** (a) **Vitest** over `packages/core` with `:memory:` SQLite per test; (b) **the 100k-link seeded fixture DB as a P0 deliverable**, with weekly CI perf assertions — import < 60 s, p95 search < 150 ms, kNN build < 120 s, Louvain < 30 s, map first paint < 2 s; (c) a **Playwright `_electron` smoke test**, growing one scenario per phase; (d) i18n lint for hardcoded strings. **From P3:** golden extractor fixtures (~40 domains) plus a weekly live canary allowed to fail loudly without blocking. **From P4:** the AI eval harness (50 labelled URLs — 25 FR, 25 EN — and 30 queries scored hit@5 / MRR@10) gating any model or prompt change. **From P6:** fast-check property tests on the op-log merge. **From P9:** CRDT convergence tests on three replicas, random partitions, fixed seeds, a `regressions/` folder.

**The human rig rule** (the Planner writes the checklists; this is the rule they follow). **Every phase ends with a human rig test on both machines — RTX 3050 Ti / Windows and M1 16 GB — signed off in `plans/` before the phase branch merges.** Each checklist is at most 10 numbered steps; each has an observable pass criterion **and a blank for a measured number** (seconds, tok/s, MB, °C) — never "works / doesn't work". Each must contain one **cold** case (fresh `userData`, no models), one **scale** case (the 100k fixture), one **failure** case (network off, model missing, malformed import). Numbers go back into the plan file, and **the default model and the AI budget caps are set from those numbers, not the Expert's estimates** — which he flagged unverified and which are load-bearing for decisions 4, 5 and 16.

**Weighed.** The Expert lists seven test layers; making all seven mandatory from phase 1 is how a solo developer stops shipping. Four start immediately because they are cheap and catch the expensive bugs; the rest attach to the phase that creates their subject. This is a performance-bound product on two specific machines, and no CI runner has a 4 GB RTX 3050.

**Reverse if.** The weekly scale run exceeds ~15 minutes → move it to a manual pre-merge command, but never delete it.

---

## Open questions for the user

1. **Product name?** Cairn / Marelle / Herbier. *Default: **Cairn**, pending a trademark/npm/domain check.*
2. **Buy the Apple Developer Program (€99/yr)?** *Default: yes, during P7, before any build goes to a friend.*
3. **Does any friend use an Intel Mac?** *Default: build `darwin-x64` best-effort with direct transfer disabled.*
4. **Is a free-tier Gemini key acceptable at all?** *Default: allow, behind a blocking warning, restricted to URL + title.*
5. **Snapshots: opt-in with a 5 GB cap, or off entirely in v1?** *Default: opt-in per collection, off by default, 5 GB LRU — 100k pages would be ~40 GB.*
6. **Who hosts the v1.5 mailbox node; is €5/month acceptable?** *Default: no mailbox in v1; friends exchange bundle files over channels they already use.*

## Handoff notes for The Planner and The Builder

- **The save path must not be able to reach the generation provider.** A module boundary or lint rule, not a comment.
- **Every mutation goes through one `applyOp(op)` layer** writing an append-only `ops` row stamped `(actor_pubkey, HLC)`. No direct `UPDATE` from feature code.
- **UUIDv7 everywhere; never expose an autoincrement PK.** Tree nodes carry fractional indices from day one.
- **`packages/core` has zero `node:` imports.** Lint it — it keeps the PWA and extension options alive.
- **Store 768-d embeddings, index 256-d**, stamping `model_id` and `dim` on every row. Indexes are disposable; vectors are not.
- **Benchmark both rigs before locking the default model.** The Expert's tok/s figures are estimates; decisions 4, 5 and 16 rest on them.
- **Nothing that changes user-visible structure or tags auto-applies.** Run → diff → accept → 30-day atomic undo. `runs` is the undo unit; design it before the first line of clustering code.
- **Snapshots are content-addressed by BLAKE3**, so the bundle store and a future iroh-blobs store are one store.
- **Rate limit per hostname (1 req / 2 s, jittered), concurrency 4, bulk backfill capped at 2,000/day.** Protect the home IP.
- **`egress_log` is a screen, not a setting.** Every cloud call, third-party fetch and peer transfer writes a row.
- **Provenance is a visible field.** Keep `confidenceScore` / `confidenceReason`, add `acquisitionMethod`.
- **License gate:** MIT / Apache-2.0 / ISC / BSD only. Cosmograph banned; UpSet.js blocked; Karakeep (AGPL) is an import source, never a code source.
- **Add `.env` to `.gitignore` and rotate the Gemini API key** — baked into the client bundle via `vite.config.ts` `define`, possibly in git history. P0, first commit.
- **Build and install a throwaway unsigned installer on both rigs at the end of P0.** artlux's fuses-vs-signature tripwire is the precedent.
- **Every phase branch merges only after a signed-off human rig test on both machines**, numbers written into `plans/`: max 10 steps, each with a number, always one cold, one scale and one failure case.
- **The 100k fixture DB is a P0 deliverable** — three later decisions rest on numbers only it produces.
- **i18n starts in P0**, not in polish. Retrofitting FR/EN into a built UI costs several times more.
- **Ollama is the development-time generation provider** — already installed with 15 models. Do not let packaging block phase 4.
- **The demo screenshot is the map with a lasso selection and a stats panel.** If a phase-2 task does not move that image closer, it belongs to a later phase.
