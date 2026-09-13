# The Expert's Report — Local-First P2P AI Bookmark Manager, 2026 Technology Review

**Verification policy.** Versions pulled live from npm/GitHub/vendor docs on 2026-09-11/12. Third-party benchmark figures are labelled. Anything not confirmed is marked **[UNVERIFIED]**.

**Constraints driving this revision.** (1) One codebase, Win/Linux/macOS, Electron unless Tauri clearly wins. (2) Users = dev + a few non-technical friends → signed installers, one-click invites, no manual model setup. (3) Reference hardware: RTX 3050 laptop 4 GB VRAM Windows; Apple M1 16 GB. (4) 10k–100k links local, small shared subset. (5) "Training" = LLM-driven tag consolidation + theme-tree generation, not fine-tuning. (6) FR + EN UI.

**Codebase today:** React 19.2 / Vite 6 / Express 5 / `@google/genai` 1.28, Gemini with `googleSearch` grounding, `Bookmark` type with `summary/keywords/confidenceScore/platform`, Notion service on a proxy-fetch shim, a dozen `test-fetch-*.js` scratch files probing anti-bot workarounds. **Content acquisition is the hard problem, not AI.**

---

## 1. App shell

| Option | Version / status | License | Footprint | Notes |
|---|---|---|---|---|
| **Electron** | 44.3.0 (2026-09-08), Chromium 152 / Node 24.18.1; major every 8 weeks | MIT | ~150–180 MB installed; ~85 MB NSIS | Node-native works: better-sqlite3, node-llama-cpp, onnxruntime-node, usearch, youtubei.js, @number0/iroh. `utilityProcess` for crash isolation. Playwright `_electron` first-class. |
| **Tauri** | core 2.11.5 (2026-07-01) | MIT/Apache-2.0 | ~6–12 MB | Rust core; OS WebView (WebView2 / WKWebView / WebKitGTK) = three rendering engines. |
| Pure PWA | — | — | 0 | No cross-origin fetch, no sidecars, no raw sockets. Non-starter. |
| Local server + browser (today) | — | — | 0 | No auto-update, signing, tray. Hostile to non-technical friends. |

### Recommendation: Electron 44+, core written as runtime-agnostic TypeScript.
- Hidden `BrowserWindow` with `session` control = headless Chromium at 0 MB marginal cost (anti-bot fetching).
- Iroh 1.0 (2026-06-15) ships `@number0/iroh@1.1.0` napi prebuilds (win32 x64/arm64, darwin arm64, linux gnu/musl, Android). **No darwin-x64 prebuild listed** (Intel Mac risk).
- `node-llama-cpp@3.20.0` auto-detects CUDA/Vulkan/Metal, auto-downloads GGUFs, JSON schema at generation level.
- electron-builder + electron-updater validate signatures on Win and macOS; notarization built in.
- Playwright `_electron.launch()` supported; Tauri's `tauri-driver` has no macOS support.
- Tauri wins only if extraction is rewritten in Rust or the mobile companion shares the codebase.

### Signing plan
| Platform | Path | Cost |
|---|---|---|
| Windows | Azure Artifact Signing (ex-Trusted Signing) cheapest but gated to US/Canada individuals and 3+-year orgs → likely ineligible in France. Fallback: OV cert on hardware token (Certum's open-source/individual line is the usual EU budget answer [UNVERIFIED pricing]), or EV for instant SmartScreen reputation. | OV ≈ €130–400/yr; EV ≈ €400–600/yr |
| macOS | Apple Developer Program + notarytool | €99/yr |
| Linux | AppImage + .deb, no signing | €0 |
CI secrets: `CSC_LINK`/`CSC_KEY_PASSWORD`, `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`; tag push → signed installers + `latest.yml`/`latest-mac.yml`; GitHub Releases feed.

### Companion apps
No mobile first. Ship (a) MV3 browser extension posting the rendered, authenticated DOM to `127.0.0.1`; (b) PWA capture page served over LAN/Tailscale with Android share-target. Tauri 2 mobile stays shelved.

### Gotchas
Chromium bump every 8 weeks (half a day/quarter). Keep `core/` free of `node:` imports. `nodeIntegration` off, `contextIsolation` + `sandbox` on, narrow `contextBridge`. A bookmark manager renders hostile HTML by definition.

---

## 2. Local database

At 100k links × ~8 chunks → **~800k chunk vectors**.

| Option | Version | License | Verdict |
|---|---|---|---|
| **better-sqlite3** | 13.0.3, Node ≥22 | MIT | Synchronous, fastest, prebuilds all desktop targets. |
| **@sqlite.org/sqlite-wasm** | 3.53.4-build1 | Apache-2.0 | Official WASM + OPFS; PWA twin. |
| **sqlite-vec** | 0.1.9 stable; 0.1.10-alpha.4 (2026-05-18) adds DiskANN/IVF, alpha | MIT/Apache | Brute force only in stable. Bench: 100k × 384-d, k=10 → ~4 ms. ANN not needed until well past 100k. |
| **usearch** | 2.26.2 | Apache-2.0 | HNSW, save/load/**view() mmap**. Bench: 367 QPS at 100k; scales to millions. |
| PGlite | 0.5.8, 3.7 MB gz; pgvector `@electric-sql/pglite-pgvector@0.0.5` | Apache-2.0 | Browser-only apps. 0.0.x vector extension. |
| LanceDB | `@lancedb/lancedb@0.38.0` | Apache-2.0 | Strong, but still need SQLite for relational + FTS. |
| DuckDB-wasm | 1.33.1-dev57 | MIT | Analytics over exports only. |
| Kuzu | Apple acquired Oct 2025; repo archived; npm deprecated. Forks LadybugDB, Bighorn | MIT | Do not adopt. |
| sqlite-vss | abandoned for sqlite-vec | — | No. |
| CozoDB / TypeDB | dormant [UNVERIFIED] / server-oriented | — | No. |

Full-text: SQLite FTS5 (`unicode61 remove_diacritics 2` for French). FlexSearch 0.8.212 / MiniSearch for browser mirror. Tantivy: unofficial bindings only.

### Recommendation: SQLite + FTS5 + two-tier vectors, snapshots as content-addressed files.
```
SQLite (better-sqlite3, WAL)
├─ bookmarks, chunks, tags, bookmark_tags, themes, tree_nodes, collections, peers, feedback, embeddings_blob
├─ bookmarks_fts / chunks_fts          ← FTS5 external-content + triggers
└─ vec_docs                            ← sqlite-vec, 100k × 256-d, EXACT brute force (~40–90 ms)

usearch HNSW index (on disk, view() = mmap)
└─ chunk vectors, ~800k × 256-d        ← global semantic search over passages

Filesystem
└─ snapshots/<sha[0:2]>/<sha>.html.zst ← content-addressed (BLAKE3/sha256)
```
- Doc-level (100k) must be exact (feeds clustering, trees, map). sqlite-vec brute force 100k × 256 f32 (100 MB) well under 100 ms.
- Chunk-level (800k) only feeds RAG → approximate fine; usearch view() keeps it mmap'd (critical on 16 GB M1 holding a 3 GB model).
- In-group RAG (≤500 chunks) → brute-force subset from `embeddings_blob`, exact, <10 ms.
- Snapshots as files: 100k × ~400 KB zstd ≈ 40 GB; never in SQLite page cache; shareable via iroh-blobs (content-addressed).
- PWA mirror: sqlite-wasm + OPFS. **sqlite-vec is not in the official sqlite-wasm build** → custom WASM or Worker brute-force cosine (fine to ~50k).

Gotchas: `PRAGMA journal_mode=WAL; synchronous=NORMAL; foreign_keys=ON; busy_timeout=5000; mmap_size=268435456;`. Store raw embeddings as BLOB column so indexes are disposable. French FTS `remove_diacritics 2`; Snowball stemming needs custom build → query-side stem map. usearch rebuild for 800k takes minutes → incremental `add()`. Virtualised lists everywhere (`@tanstack/react-virtual`).

---

## 3. Local-first sync / CRDT layer

| Option | Version / status | License | Tree CRDT | Groups/perms | No mandated server |
|---|---|---|---|---|---|
| **Loro** | `loro-crdt@1.16.1` (2026-09-10), very active | MIT | ✅ movable tree, MovableList, rich text, counter, shallow snapshots, ephemeral store, undo/time-travel | ❌ | ✅ |
| Automerge | `automerge@3.4.1` (2026-08-12), 3.0 cut memory >10×; `automerge-repo@2.6.0-alpha.3` | MIT | ❌ no move op | ❌ | ✅ |
| Yjs | 13.6.32 | MIT | ❌ | ❌ | ✅ |
| Jazz | `jazz-tools@0.20.19` | MIT | ❌ | ✅ Groups admin/writer/reader, E2EE | ⚠️ needs sync server |
| Evolu | `@evolu/common@8.10.0` | MIT | ❌ | mnemonic-owner | relay |
| Triplit | acquired by Supabase 2025 | — | ❌ | ✅ | ❌ |
| Zero | `@rocicorp/zero@1.9.0` | Apache-2.0 | ❌ | server-authoritative | ❌ |
| TinyBase | 9.7.0 | MIT | ❌ | ❌ | ✅ |
| cr-sqlite | [UNVERIFIED / stalled], no 2026 releases | MIT | ❌ | ❌ | ✅ |
| ElectricSQL, PowerSync, SQLSync, Fireproof, InstantDB, DXOS, Ditto, Verdant | server-centric / commercial | — | ❌ | — | ❌ |

### Recommendation: Loro as source of truth (one doc per collection); SQLite as derived, rebuildable index.
```
Loro (authoritative, syncs P2P)              SQLite + usearch (derived, disposable)
collection:<uuid>                             bookmarks / chunks / tags / themes / tree_nodes
  ├ LoroMap   meta   (name, members, epoch)   *_fts (FTS5)
  ├ LoroMap   items  <id → LoroMap>           vec_docs (sqlite-vec)
  └ LoroTree  tree   (Pearltrees hierarchy)   chunks.usearch (HNSW)
private:library   (everything unshared)
```
Every Loro event → project into SQLite in a transaction. Corruption/migration = drop SQLite, re-derive.

Why Loro over Automerge: movable tree is non-optional (concurrent reparent in Automerge can cycle/duplicate). Shallow snapshots, undo, time travel. Sep-2026 release hardened repeated concurrent imports (400 stale-head imports: 2.4 s → 70 ms) = the offline catch-up path. Why not Jazz: mandates sync topology/auth/storage, no tree.

Gotchas: `loro-crdt` ~20 MB unpacked, shipped wasm ~1.5–2 MB (lazy-load in PWA). **Never one doc for the whole library**: one per collection = permission granularity, sync unit, memory bound. Periodic `export({mode:"shallow"})`. Loro provides no auth/encryption/access control. **Design the schema for Loro now** (stable UUIDs, no autoincrement PKs, no destructive updates) even if adopted later.

---

## 4. P2P transport & identity

| Option | Status 2026 | Notes |
|---|---|---|
| **Iroh 1.0** | shipped 2026-06-15; `@number0/iroh@1.1.0` (MIT/Apache) | QUIC, dial-by-Ed25519-pubkey, hole punching, n0 relay fallback. iroh-blobs / iroh-gossip / iroh-docs production-ready but not 1.0. |
| **Trystero** | 0.25.4 (~41 KB), MIT; 0.23.0 (Mar 2026) split into `@trystero-p2p/{core,nostr,mqtt,torrent,supabase,firebase,ipfs}`; default Nostr | WebRTC + serverless matchmaking. Robustness: Nostr → MQTT → BitTorrent → IPFS. |
| js-libp2p | maintained; WebRTC browser↔browser; WebTransport Chromium-only | Huge surface for six primitives. |
| Hypercore / Pear | stable (Keet); Pear runtime on Bare | Wants to own the runtime. |
| **Nostr** | `nostr-tools@2.25.2` (Unlicense). NIP-44 v2, NIP-17 gift wrap, NIP-51 lists. NIP-EE (MLS) unmerged | Excellent rendezvous + async mailbox; poor bulk transport. |
| Willow / Earthstar | willow-rs Oct 2025; iroh-willow unreleased | Not shippable 2026. |
| ATProto | federated PDS | Wrong shape. |

### Recommendation: three tiers behind one `SyncTransport` interface.
1. **Direct QUIC (desktop↔desktop): Iroh.** Ed25519 keypair; pubkey = dialable NodeId. ALPN `/bkm/loro/1` streams Loro updates; iroh-gossip per-collection topics; iroh-blobs for snapshots (BLAKE3 matches snapshot store).
2. **WebRTC (browser/PWA/extension): Trystero, Nostr strategy.** 41 KB, no signaling server.
3. **Async catch-up:** preferred = any online group member relays (gossip: Alice↔Carol online, Bob returns, syncs from Carol; zero infra). Fallback = **encrypted Nostr mailbox**: NIP-44 batches as replaceable kind 30078 (`d` = collection id) on 3–5 public relays; >64 KB → post an iroh-blobs ticket. Optional = headless "home node" (same app, `--headless`, on a Pi/VPS).

### Identity and zero-config invite
- One Ed25519 master key = iroh NodeId = `did:key` (0xed) = invite signing key. Backup: 24-word BIP39 mnemonic. Derive X25519 (`@noble/curves`) for key agreement; separate secp256k1 key for Nostr mailbox.
- Invite = one link: `bkm://join/<base58(collectionId ‖ epoch ‖ inviterNodeId ‖ relayHints ‖ expiry ‖ sig)>`; custom protocol handler registered by installer. Flow: friend clicks → app opens → "X invites you to *Collection* (412 links). Accept?" → dials inviter over iroh, sends pubkey → inviter approves → seals `K_epoch` to friend's X25519 key → publishes updated meta. Also render as QR.
- Group keys: **do not attempt MLS in 2026.** Wrapped group keys: per-collection random 32-byte `K_epoch`, content sealed with XChaCha20-Poly1305 (`@noble/ciphers`); `K_epoch` sealed per member. Add member = one sealed copy. Remove = new epoch, re-seal, future updates only. State plainly in UI (FR/EN) that removal prevents future changes only.

Gotchas: n0 relays best-effort → configurable relay list. Symmetric NAT defeats hole punching 5–15% → relay saves you; test on phone hotspot. No darwin-x64 prebuild → verify before promising Intel Mac. Hash Trystero room IDs.

---

## 5. Local AI

### Runtimes
| Option | Version | License | Fit for "friends who install nothing" |
|---|---|---|---|
| **node-llama-cpp** | 3.20.0, Node ≥20 | MIT | **Best fit.** Auto-detects backend; prebuilt CUDA/Vulkan/Metal; `resolveModelFile()` auto-downloads GGUFs from HF URIs; JSON schema at generation level. |
| llama.cpp `llama-server` sidecar | rolling | MIT | ~15–20 MB binary; extra process mgmt + signing surface (downloaded .exe trips SmartScreen). |
| Ollama | 0.34.0 (2026-09-05); `ollama@0.6.3` npm | MIT | Best UX if already installed; separate installer/service/model dir. **Demote to optional detection.** |
| LM Studio | `@lmstudio/sdk@1.5.0` | Apache-2.0 | Detect-and-use for power users. |
| **transformers.js v4** | `@huggingface/transformers@4.2.0` (~9.5 MB), onnxruntime-node 1.24.3 / onnxruntime-web 1.26-dev | Apache-2.0 | **Embeddings engine.** Rewritten C++ WebGPU runtime runs in Node. |
| WebLLM | 0.2.83/0.2.84 (Apr 2026) | Apache-2.0 | PWA-only generation. |
| ONNX Runtime GPU (Win) | DirectML EP in "sustained engineering"; CUDA EP needs CUDA 12.x + cuDNN 9 | MIT | CPU embeddings + optional CUDA. Don't build on DirectML. |

### Recommendation: node-llama-cpp in an Electron `utilityProcess`, shipping Vulkan + Metal + CPU, auto-downloaded models.
**node-llama-cpp prebuilt CUDA binaries require CUDA Toolkit 13.1+ on the user's machine.** Friends won't have it. So: ship Vulkan (Win/Linux) + Metal (macOS) + CPU; Vulkan costs ~15–30% vs CUDA on the 3050; offer CUDA as optional extra download. Run inference in `utilityProcess` (OOM must never kill the library process). **Embeddings separate and on CPU when an LLM is loaded** (4 GB: LLM 2.8 GB + embedder 0.4 GB + context thrashes) via onnxruntime-node CPU.

First-run: "Téléchargement du modèle IA local (2,4 Go)… Vous pouvez continuer." Search works immediately (embedding model ~200 MB downloads first); summaries backfill.

### Model picks
| Role | Model | Quant / size | RTX 3050 (4 GB) | M1 16 GB |
|---|---|---|---|---|
| Summarise / keywords / JSON (default) | **Qwen3.5-4B-Instruct** (Apache-2.0, 256K ctx, FR strong) | Q4_K_M ≈ 2.5–2.8 GB | ✅ at 4K context (cap it) | ✅ 16K |
| Summarise low-VRAM / battery | **Gemma 4 E2B-it** (Apache-2.0, 140+ langs, QAT) | Q4 ≈ 1.5–2 GB | ✅ roomy | ✅ very fast |
| Summarise quality tier | **Gemma 4 E4B-it** | Q4_K_M ≈ 10 GB VRAM rec. | ❌ | ✅ unified memory |
| **Embeddings** | **EmbeddingGemma-300M** (`onnx-community/embeddinggemma-300m-ONNX`, q8), 768-d Matryoshka → 256-d, 100+ langs, MTEB Multilingual v2 61.15 | ≈ 200 MB | ✅ CPU | ✅ |
| Embeddings alt | `nomic-embed-text-v2-moe` (305M active, ~100 langs, 2048 tok, MRL 768→256) | ≈ 300 MB | ✅ | ✅ |
| Reranker (opt.) | **Qwen3-Reranker-0.6B-ONNX** or `bge-reranker-v2-m3` | ≈ 350–600 MB | ✅ CPU top-30 | ✅ |
Rejected: Qwen3-Embedding-8B (too heavy), Qwen3.5-8B+ (won't fit 3050), all-MiniLM (weak, poor French).

### Throughput (calibrated estimates)
| Machine | Model | Generation | 400-token structured summary |
|---|---|---|---|
| RTX 3050 4 GB, Vulkan | Qwen3.5-4B Q4_K_M | ~30–45 tok/s | 9–14 s |
| RTX 3050 4 GB, Vulkan | Gemma 4 E2B Q4 | ~55–80 tok/s | 5–8 s |
| M1 16 GB, Metal | Qwen3.5-4B Q4_K_M | ~15–22 tok/s | 18–27 s |
| M1 16 GB, Metal | Gemma 4 E4B Q4 | ~9–13 tok/s | 30–45 s |
| CPU-only fallback | 4B Q4 | 6–14 tok/s | 30–60 s |
Anchors: M1 16 GB ~8 tok/s on Llama 3.1 8B Q5_K_M (third-party). Embeddings EmbeddingGemma-300M, 512-token chunks: CPU ~15–40 chunks/s; CUDA ~150–400/s; WebGPU ~60–150/s.

### The number that shapes the product
**100k links × 10 s/summary ≈ 12 days of continuous local inference. Embedding 800k chunks at 25/s ≈ 9 hours.** Therefore: (1) embeddings first for everything (search/clustering/trees need no summaries); (2) summaries opt-in and prioritised (recency, explicit request, current collection), never a blanket backfill; (3) bulk summarisation is the cloud's job: `claude-haiku-4-5` Message Batches API at 50% cost → present as a priced choice; (4) visible, pausable, throttled queue (pause on battery / thermal).

### Cloud fallback
Gemini (verified): `gemini-3.8-flash` (latest stable Flash), `gemini-3.7-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.1-pro-preview`; embeddings `gemini-embedding-001`, `gemini-embedding-2-preview`. Pro paid-only since 2026-04-01; free tier Flash/Flash-Lite ~10–15 RPM, ~1,500 RPD [third-party]. Move the hardcoded `gemini-3.7-flash` to config, default `gemini-3.8-flash`. Keep `googleSearch` grounding as last-resort extraction. Use `responseSchema` + `responseMimeType: "application/json"`.
Anthropic: `claude-opus-5` (1M ctx, $5/$25), `claude-sonnet-5` (1M, $2/$10), `claude-haiku-4-5` (200K, $1/$5). Bulk: `claude-haiku-4-5` + Batches (`client.messages.batches.create`, poll `processing_status` until `ended`, 50%). Structured output via `output_config: { format: {...} }` (old `output_format` deprecated) or tool with `strict: true`. Assistant prefill removed; `budget_tokens` gone → `thinking: {type:"adaptive"}` + `output_config.effort: "low"`; `cache_control: {type:"ephemeral"}` on long instructions.

### Structured outputs
node-llama-cpp: JSON schema at generation (GBNF). llama-server: `json_schema`/`grammar`. Ollama: `format: <JSON Schema>`. Gemini: `responseSchema`. Claude: `output_config.format` or strict tool. Define schema once in Zod, emit JSON Schema, still validate.

---

## 6. Content acquisition
Layered pipeline, per-domain routing, provenance recorded (`acquisitionMethod` alongside `confidenceReason`). Stop at first success.

| # | Tier | Tool | Notes |
|---|---|---|---|
| 0 | Structured API | GitHub REST, arXiv, HN Firebase, Reddit `.json`, Bluesky `getPostThread`, Mastodon statuses, Wikipedia REST | Route by hostname. |
| 1 | Platform shims | YouTube → `youtubei.js@18.0.0` (MIT) metadata + captions; X → FxEmbed/FxTwitter API v2 (free, no auth) + syndication; Threads → oEmbed/OG | Optional detected `yt-dlp` sidecar. |
| 2 | Fetch + extract | `undici` real UA + `Accept-Language: fr,en` → `defuddle@0.19.3` (MIT, kepano; powers Obsidian Web Clipper) → `@mozilla/readability@0.6.0` fallback; parse with `linkedom` | ~70% of URLs. |
| 3 | PDF | `unpdf@1.8.1` (pdf.js); <100 chars/page ⇒ scanned ⇒ `tesseract.js` `fra+eng` | |
| 4 | Render in-app | Hidden `BrowserWindow` → `session.setUserAgent` → network-idle → `executeJavaScript(outerHTML)` → tier 2 | Free headless Chromium; SingleFile-style inlining for snapshot. |
| 5 | Extension-as-fetcher | MV3 extension POSTs live, logged-in DOM to `127.0.0.1:<port>/capture` with per-install shared secret | Only reliable answer for paywalls, Turnstile, logged-in feeds. |
| 6 | Archive fallback | Wayback availability API → archived HTML → tier 2 | Free. |
| 7 | Cloud extraction (opt-in, badged) | `r.jina.ai/<url>` (content transits Jina) or Gemini `googleSearch` grounding | Off by default. |
| 8 | Graceful failure | URL + OG tags + low confidence | Never a hard error. |

Not recommended: Firecrawl self-hosted (AGPL), Crawl4AI (Python sidecar), Monolith (license unverified), SingleFile CLI (pulls Puppeteer).
Gotchas: per-hostname rate limit (1 req / 2 s, jittered); store raw bytes + hash + timestamp + method (re-extract from archive when extractor improves); respect robots.txt tiers 2–4 with override; golden fixtures + weekly live canary for shims.

---

## 7. Clustering, topics & trees
- umap-js 1.4.0 (MIT) last published June 2024; pure JS kNN unusable above ~10k. ❌ at scale.
- HDBSCAN in JS: nothing credible. ❌
- **graphology + graphology-communities-louvain**: 100k nodes / 1.5M edges in seconds. ✅
- BERTopic: Python only.

### Recommendation: kNN-graph + multi-resolution Louvain in full embedding space; c-TF-IDF for terms; LLM only for naming. UMAP never touches clustering.
```
100k doc embeddings (256-d, exact)
  → cosine kNN graph, k=15                      (100k sqlite-vec queries ≈ 60–120 s, once)
  → Louvain @ r=0.4 → ~15–30 top themes; @ r=1.0 → ~120–250 sub-themes; @ r=2.0 → ~600–1200 leaves
  → c-TF-IDF per cluster (FR+EN stopwords, diacritic-folded) → top 8 terms
  → LLM: {label, description, emoji} from 8 terms + 5 titles   (~1500 calls total)
  → materialise into a LoroTree
```
Louvain: fast, deterministic with seed, one knob (`resolution`) exposed as granularity slider, hierarchy for free.

**2D map at 100k:** landmark projection: fit umap-js on 8–10k stratified sample, place the rest at inverse-distance-weighted centroid of 10 nearest landmarks. Compute once in a Worker, store `x,y` in SQLite.

**Themes depending on context:** same pipeline on a subset (top-N for query → kNN → Louvain → label). N ≤ 500 → <300 ms + one LLM call.

**Keywords:** KeyBERT-style (candidate n-grams with FR/EN stopwords, embed, cosine to doc, MMR-diversify to 5). Skip YAKE/RAKE ports.

Gotchas: re-normalise after Matryoshka truncation; c-TF-IDF needs FR stopwords + diacritic folding + mixed-language clusters; re-cluster only when >5% changed; cache kNN edges in a table.

---

## 8. Visualization
| Need | Pick | Version | License | Notes |
|---|---|---|---|---|
| 2D map, 100k pts | `@deck.gl/core` + `@deck.gl/layers` ScatterplotLayer (+ HexagonLayer low zoom) | 9.4.0 | MIT | WebGL2, 1M+ points; scoped packages only. Alt `regl-scatterplot` (~120 KB). |
| Graph / co-occurrence | `sigma@3.0.3` + graphology | 3.0.3 | MIT | ~20–50k edges; use for a theme's neighbourhood, not whole library. Also supplies Louvain. |
| Hierarchies | `d3-hierarchy` + Canvas | 3.x | ISC | tree/treemap/partition; Canvas past ~2k nodes. |
| Stats, timelines | `@observablehq/plot` | 0.6.x [not re-verified] | ISC | Aggregate before plotting. |
| Tag intersections | `@upsetjs/react@1.11.0` | ⚠️ non-standard license (dual AGPL/commercial) — verify | Cheaper: Plot cell heatmap + `d3-chord`. |
Avoid Cosmograph (CC-BY-NC-4.0). Don't require WebGPU (WebGL2 everywhere). Colour ≤10 hues + "autre"; deck.gl GPU picking; labels only for centroids above zoom threshold.

---

## 9. Local RAG
Chunking: structure-aware on h1–h3, ~450 tokens, 60 overlap, never crossing a heading; persist `(bookmarkId, headingPath, charStart, charEnd)` for clickable citations. PDFs on page + paragraph. `chonkie@0.3.0` / `semantic-chunking@3.0.2` OK but ~150 own lines beats both.
Retrieval: FTS5 BM25 (k=50) + vector (k=50) → RRF(k=60) → top 30 → rerank → top 6–8. Group-scoped (≤500 chunks) brute-force exact <10 ms; global usearch ~3–8 ms. Post-RRF boosts (recency/tag/domain).
Context budget: ≤3,000 tokens for a 4B, ≤8,000 for 8B; over budget → compress chunks to 2 sentences.
Citations: `[[c:<chunkId>]]` markers → footnotes to `bookmark#charStart`; regenerate if zero markers. Claude: native `citations: {enabled: true}`.
UX: group = first-class saved selection; source chips; "utilisé / non utilisé" marks; pre-warm chunk vectors.
Libraries: **Vercel AI SDK `ai@7.0.97`** (Apache-2.0, Node ≥22) with `@ai-sdk/google`, `@ai-sdk/anthropic`, `ollama-ai-provider-v2@4.0.1`; `generateObject` + Zod. node-llama-cpp community provider exists. `llamaindex@0.12.1` wants to own storage. `@mastra/core@1.66.0` 64.6 MB → too heavy. LangChain.js skip.

---

## 10. "Training" reframed as taxonomy self-organisation
LLM calls scale with clusters, not documents.

### (a) Tag consolidation
100k imported links carry 3k–15k tags, mostly near-duplicates (`ml`, `ML`, `machine-learning`, `apprentissage automatique`).
```
1. Normalise: NFKC, casefold, strip diacritics, singularise (FR+EN), trim punctuation
2. Embed all tags (10k tags ≈ 7 min CPU, once)
3. Agglomerative merge at cosine ≥ 0.88, average linkage
4. Co-occurrence guard: refuse merges when Jaccard < 0.05 (homonyms: "Python")
5. LLM adjudicates each candidate group (≈300–800 calls): {canonical, aliases[], translations:{fr,en}, confidence, reason}
6. REVIEW QUEUE. Never auto-merge. "412 fusions proposées", bulk accept/reject, single undo.
```
FR/EN pairing first-class: `photographie argentique` ⟷ `film photography` = one concept, two labels.

### (b) Hierarchical topic modelling
Multi-resolution Louvain = structural backbone; LLM = labeller/refiner (LHATM, SC-Taxo pattern). Failure mode: LLM as isolated generator → drift, hallucinated nodes. Ground every node in a real cluster.

### (c) TopicGPT pattern, affordably
```
GENERATE (LLM ~1,500 calls): per cluster per resolution: 8 c-TF-IDF terms + 5 titles + 3 summaries
   → {label_fr, label_en, description_fr, description_en, emoji, parent_hint}
   then one pass over sibling sets (~200 calls) to dedupe/merge/split
ASSIGN (embeddings, 0 LLM calls): embed label+description → centroid; assign all 100k docs by cosine with margin threshold
REFINE (LLM, tail only): docs whose top-2 centroids within 0.02 (~2–5%) → LLM adjudicates
```
Budget ~2,000 calls × ~600 in / 200 out: locally on 3050 ~3–5 h overnight; Haiku Batches a few euros, ~1 h.

### (d) Freshness
New bookmark → embed → nearest centroid; low margin → "À classer". Nightly: if >5% changed or "À classer" > 200 → re-run Louvain, **diff the tree** ("3 nouveaux thèmes, 2 fusionnés"). Tree lives in a `LoroTree` so drags/renames/pins survive regeneration (best argument for Loro).

### (e) Cheap wins first
Log `(query, shown, clicked, dwell)`; post-RRF boost: tag affinity, domain affinity, recency decay, open count. ~50 lines.

Product framing: "Réorganiser ma bibliothèque / Reorganise my library". Preview + diff before applying; full undo; per-collection opt-out; never propagate into a friend's shared collection without acceptance.
Gotchas: stable node IDs matched old→new by centroid similarity; bilingual labels generated together; cap depth at 4.

---

## 11. Import / export
| Source | Format / API | Notes |
|---|---|---|
| **Notion** | REST, `Notion-Version: 2025-09-03` | **Breaking:** `/v1/databases/:id/query` → `/v1/data_sources/:id/query`; database = container of data sources; resolve `database → data_sources[]`, query by `data_source_id`; ~3 rps; `next_cursor` 100/page; blocks→Markdown via recursive `blocks.children.list`. Current `notionService.ts` on `2022-06-28` works only for single-data-source DBs. |
| Netscape HTML | `<DL><DT><A HREF ADD_DATE ICON>` | `linkedom`; ADD_DATE unix seconds; folders `<H3>`. |
| Chrome/Edge live | JSON file | Win `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Bookmarks`; macOS `~/Library/Application Support/Google/Chrome/Default/Bookmarks`; Linux `~/.config/google-chrome/Default/Bookmarks`. Copy before reading. |
| Firefox | `places.sqlite` (locked) | Copy, then `moz_bookmarks ⋈ moz_places`. |
| Pocket | shut down 2025-07-08; exports closed Nov 2025 | Legacy ZIP of CSVs (split every 10k) + `annotations/`. |
| Raindrop | CSV (`folder,title,note,excerpt,url,tags,created`) + REST | CSV enough. |
| Karakeep | JSON or HTML export; scheduled backups | Richest source (tags, notes, highlights). |
| Omnivore | JSON export | Defunct service. |
| Obsidian | Markdown + YAML frontmatter | Both directions. |
Export policy: one "Tout exporter" → `bookmarks.json`, `bookmarks.html` (Netscape), `markdown/` (Obsidian), `snapshots/`, `library.db`. Stream everything. Import at scale: one `db.transaction()` + prepared statement (~2–5 s for 100k), then enqueue background work; dedupe report by normalised URL before commit.

---

## 12. Testing & quality
| Layer | Tool | Approach |
|---|---|---|
| Unit / integration | **Vitest 5.0.0** | Node env for core, happy-dom for React, `:memory:` SQLite per test. |
| **CRDT convergence** | **fast-check 4.10.0** | Random op sequences on 3 replicas, random apply orders + partitions; assert `toJSON()` equality, no tree cycles/orphans. Fixed seed; `regressions/` folder of failed seeds. |
| Extractors | golden files | `fixtures/<domain>/<hash>.html` + `.expected.json` from raw fetched bytes; ~40 fixtures; weekly live canary in CI. |
| E2E desktop | Playwright `_electron` | Real windows, IPC, SQLite. |
| P2P | custom harness | N instances, separate `userData`, `SyncTransport` fake with partition/delay/drop/reorder; A offline ×50, B offline ×50, reconnect → converge. One loopback-iroh smoke test. |
| Scale | seeded corpus | **100k-link fixture DB is a deliverable.** p95 search <150 ms, kNN build <120 s, Louvain <30 s, map render <2 s. Weekly CI. |
| AI eval | Vitest + LLM judge | 50 labelled URLs (25 FR, 25 EN) → `{titleContains, keywordsOverlap≥3, platform, language}`; judge summaries with `claude-haiku-4-5` (batched); embeddings 30 `(query, relevantIds)` → hit@5 / MRR@10. Gate model/prompt changes. |
| i18n | `i18next` + `react-i18next` | Lint hardcoded strings; snapshot both locales; pseudo-locale for truncation. |
FR/EN specifics: detect and store each bookmark's language (`franc`); summarise into the UI locale regardless of source language; FTS5 diacritic folding; bilingual tag canonicalisation; FR+EN stopwords.

---

## Recommended Stack Summary
| Area | Choice | Version | License |
|---|---|---|---|
| Shell | Electron + MV3 extension + PWA capture page | 44.x | MIT |
| Packaging | electron-builder + electron-updater, GitHub Releases | current | MIT |
| Signing | Win: OV cert on hardware token; macOS: Apple Dev €99/yr + notarytool | — | — |
| UI | React 19 + Vite 6/7 + TS 5.8 + @tanstack/react-virtual + i18next/react-i18next | current | MIT |
| Storage core | SQLite (better-sqlite3, WAL) + FTS5 (`remove_diacritics 2`) | 13.0.3 | MIT |
| Vectors doc-level (100k) | sqlite-vec, exact, 256-d | 0.1.9 | MIT/Apache |
| Vectors chunk-level (~800k) | usearch HNSW, persisted, `view()` | 2.26.2 | Apache-2.0 |
| Snapshots | content-addressed `.html.zst` on disk | — | — |
| Browser mirror | @sqlite.org/sqlite-wasm + OPFS (+ Worker cosine) | 3.53.4 | Apache-2.0 |
| CRDT / source of truth | Loro, one doc per collection, LoroTree | 1.16.1 | MIT |
| P2P transport | Iroh QUIC via @number0/iroh; iroh-gossip; iroh-blobs | 1.1.0 | MIT/Apache |
| P2P fallback | Trystero (Nostr) for browser peers; NIP-44 Nostr mailbox | 0.25.4 / 2.25.2 | MIT / Unlicense |
| Identity & invites | Ed25519 master → did:key + NodeId; BIP39; X25519-wrapped per-collection key (XChaCha20-Poly1305) with epochs; `bkm://join/…` + QR | @noble/* | MIT |
| Model runtime | node-llama-cpp in utilityProcess; Vulkan + Metal + CPU; auto-download; JSON schema; CUDA optional; Ollama/LM Studio detection optional | 3.20.0 | MIT |
| LLM (3050) | Qwen3.5-4B-Instruct Q4_K_M @4K ctx; Gemma 4 E2B Q4 low-VRAM | — | Apache-2.0 |
| LLM (M1) | Qwen3.5-4B Q4_K_M; Gemma 4 E4B Q4 quality | — | Apache-2.0 |
| Embeddings | EmbeddingGemma-300M ONNX q8, 768→256-d, CPU via transformers.js v4 + onnxruntime-node | 4.2.0 | Apache-2.0 |
| Reranker (opt.) | Qwen3-Reranker-0.6B ONNX, top-30 | — | Apache-2.0 |
| Cloud | Vercel AI SDK ai@7 + @ai-sdk/google (gemini-3.8-flash) / @ai-sdk/anthropic (claude-haiku-4-5 + Batches) / ollama-ai-provider-v2 | 7.0.97 | Apache-2.0 |
| Extraction | defuddle → readability → hidden BrowserWindow → extension → Wayback; unpdf; youtubei.js; FxEmbed | 0.19.3 / 0.6.0 / 1.8.1 / 18.0.0 | MIT / Apache-2.0 |
| Clustering & trees | sqlite-vec kNN → graphology Louvain multi-resolution → c-TF-IDF → LLM labels (~1.5k calls) → embedding assignment → LoroTree | — | MIT |
| 2D layout | umap-js on 8–10k landmarks + inverse-distance placement, Worker, stored | 1.4.0 (stale) | MIT |
| Viz | deck.gl Scatterplot/Hexagon; sigma+graphology (subgraphs); d3-hierarchy Canvas; Observable Plot | 9.4.0 / 3.0.3 | MIT / ISC |
| RAG | FTS5 BM25 + vectors → RRF → rerank → `[[c:id]]` citations | — | — |
| Testing | Vitest 5 · fast-check 4 · Playwright _electron · golden fixtures + canary · 100k fixture · FR/EN eval | 5.0.0 / 4.10.0 | MIT |

## Risk Register
| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| 1 | Scope collapse: 12 subsystems, one dev, 100k scale | Very high | Critical | Ship in order: (1) Electron + SQLite + FTS5 + imports + virtualised UI → (2) embeddings + hybrid search + fetch pipeline → (3) Louvain themes + tag consolidation + 2D map → (4) local LLM summaries → (5) Loro migration → (6) P2P sharing → (7) RAG chat. Steps 1–3 already a product nobody ships. Design schema for Loro in step 1. |
| 2 | Extractor rot (YouTube/X/Threads) | Very high | High | Tiered pipeline; golden fixtures + weekly canary; hidden BrowserWindow tier; extension tier. Never a hard error. |
| 3 | Local summarisation can't reach 100k (~12 days) | Certain | High | Embeddings as universal substrate; summaries opt-in/prioritised; Haiku Batches priced option; pausable throttled queue. |
| 4 | 4 GB VRAM binding; E4B needs ~10 GB | High | High | Default Qwen3.5-4B Q4_K_M @4K; probe VRAM at startup; embeddings on CPU when LLM resident; honest speed estimates. |
| 5 | CUDA prebuilds need CUDA Toolkit 13.1+ | High | High | Ship Vulkan + Metal + CPU only; CUDA optional download. |
| 6 | Loro has no permissions/crypto | High | Critical | @noble primitives only; encrypt before leaving process; property-test epoch rotation; state forward-secrecy limit in UI. Revisit MLS later. |
| 7 | P2P doesn't connect for a friend | Medium | High | Iroh relay; "Connexion : directe / relayée / hors ligne" indicator; Nostr mailbox; optional home node; test on hotspot. |
| 8 | Windows signing blocked/expensive | High | High | OV cert on token or EV; meanwhile portable ZIP + bilingual SmartScreen explainer. macOS €99/yr. |
| 9 | Vector/index scale surprises | Medium | High | Two-tier split; raw embeddings in BLOB; one `VectorIndex` interface. |
| 10 | Auto-reorganisation destroys trust | Medium | Critical | Never auto-apply; review queue; diff preview; undo; LoroTree ops survive regeneration; per-collection opt-out. |

**Flagged uncertainties:** cr-sqlite stalled; Cosmograph CC-BY-NC; UpSet.js license; Monolith license; @number0/iroh no darwin-x64 prebuild; Gemini free-tier numbers third-party; Observable Plot version; EU signing pricing; RTX 3050 / M1 tok/s are calibrated estimates, benchmark both machines before committing to a default model.

**Sources:** Tauri releases · Electron 44 blog · Electron code signing · electron-builder auto-update · sqlite-vec (+ ANN issue #25) · sqlite-vss · USearch JS · node-vector-bench · PGlite · LanceDB · Kuzu→Apple (9to5mac 2026-02-11) · Loro docs + movable-tree · Automerge 3.0 · Jazz permissions · Iroh road-to-1.0 / JS / protocols · Trystero 0.23 discussion · NIP-EE · iroh-willow · Pear docs · node-llama-cpp CUDA + downloads · Ollama structured outputs · Transformers.js v4 · EmbeddingGemma (+ ONNX) · Gemma 4 (unsloth) · nomic-embed-text-v2-moe · Qwen3-Reranker ONNX · Apple Silicon LLM guide · llama.cpp VRAM guide · Gemini models · defuddle · readability · youtubei.js · unpdf · FxEmbed · Notion 2025-09-03 upgrade · Pocket shutdown · Karakeep import/export · TopicGPT · SC-Taxo (arXiv 2605.00620) · umap-js · deck.gl · sigma.js · UpSet.js · Vercel AI SDK · chonkie-ts · fast-check · ONNX Runtime DirectML
