# The Doubtful's Report — "Local-First P2P AI Bookmark Manager"
### Final version, updated for the five new developer constraints (2026-09-12)

**Sourcing note.** ~40 searches/fetches. `[F]` = fetched and read the page; `[S]` = search-snippet only; `[M]` = from memory. Most "Best X of 2026" pages are SEO content marketing; numbers are directional.

---

## 1) Executive verdict

- **It largely exists, and the closest competitor is closing the gap right now.** Karakeep (AGPL-3.0, 29.0k stars) shipped embeddings + hybrid/semantic search in v0.33.1; maintainer wrote on 9 June 2026: "embedding generation was merged two weeks ago and is used for tag generation. Chat is coming in the next release." It already has local-Ollama tagging/summaries, PDFs, OCR, monolith archival, yt-dlp, RSS, a 29-tool MCP server, and client-side crawling from the browser extension via SingleFile core (v0.32.0). ~8 of the 12 requested features are shipped or in flight there.
- **The genuinely empty ground is visual/statistical exploration of your own corpus, plus provenance honesty.** No self-hosted bookmark tool ships an embedding map, cluster statistics, overlap/intersection analysis, or query-time topic trees. That is the wedge, not P2P, not RAG, not "training."
- **The constraints make pure P2P clearly wrong.** With the dev plus a few non-technical friends, "both online at once" is the normal case, not a corner case. The fix is a **store-and-forward mailbox** (Briar Mailbox: "removes the requirement for both parties to be online simultaneously"). Pair with **iroh tickets** for zero-config invites (Delta Chat embeds iroh behind a "scan this QR" flow).
- **"AI reasoning to self-reorganise tags and build trees" is defensible with one rule: LLM calls must scale with the number of clusters, not documents.** At 100k links on the reference hardware, one LLM call per document is ~17 days of compute. Literature: cluster → label the cluster → propagate (arXiv 2502.09667 "Summaries as Centroids", ICLR 2026; arXiv 2509.19125).
- **Hardware is the real ceiling.** RTX 3050 laptop = 4 GB VRAM → 1B–3B on GPU; 7B only at Q2/Q3 with CPU offload. M1/16GB runs Llama-3.1-8B at ~10–14 tok/s. Embeddings are cheap on both; **generation is a scarce budget of ~1–2k calls per night.** Also budget ~$400–600/year in code signing (Windows EV $299–499/yr on a hardware token; Apple Developer $99/yr).

---

## 2) Prior-art comparison table

| Project | License / OSS | Storage | AI (local?) | Sharing / sync | Viz | Status 2026 | Gap vs. target |
|---|---|---|---|---|---|---|---|
| **Karakeep** (ex-Hoarder) | AGPL-3.0, 29.0k stars | Server: SQLite+Drizzle, Meilisearch | Tagging, summaries, OCR; Ollama local or OpenAI/Anthropic; embeddings 0.33 | Server accounts, list sharing, SSO; no P2P/CRDT | None | Very active | No viz/clustering, no P2P, chat just landing |
| **Linkwarden** | AGPL-3.0, ~19.7k stars | Postgres + server | AI tagging only (Ollama/OpenAI/Anthropic); no summaries, no Q&A | Teams/collections | None | Very active | No RAG, no viz, not local-first |
| **Readeck** | OSS, self-host | Server + local content store | None | Single/multi-user; EPUB/OPDS | None | Active | Reader, not knowledge tool |
| **Linkding / Wallabag** | OSS | Server DB | None/minimal | Accounts | None | Active, minimal | Not competitors |
| **Armaria** | OSS (Go) | Single SQLite file, sync it yourself | None | "Sync the file" (Syncthing/Dropbox) | None | Niche; CLI/TUI/extension | Closest storage philosophy; zero AI |
| **Anytype** | Source-available | Local objects, E2EE | Minimal | any-sync: LAN-only true P2P + relay/backup nodes, self-hostable | Graph view | Active; sync-bug complaints | Not bookmark-shaped; proprietary object model |
| **Obsidian + Web Clipper + Smart Connections** | Prop. app, OSS plugins | Local markdown vault | Local embedding model, zero setup | Obsidian Sync, or LiveSync (WebRTC + mandatory signalling relay + optional TURN) | Link graph | Very active | Closest shipping "local-first AI over clipped web content" |
| **Khoj** | AGPL-3.0, ~36k stars; 2.0.0-beta.28 (Mar 2026) | Self-host server | Ollama or cloud | Server, multi-user | None | Active | Docs-RAG, not link-shaped |
| **SurfSense** | OSS | Postgres/pgvector | Ollama-friendly; hierarchical indices, hybrid + RRF | Server | Minimal | "Not yet production-ready" | The RAG engine you'd otherwise write; heavy |
| **Hyperlink (Nexa AI)** | Closed, free | Local files | 100% on-device agentic RAG; needs 8 GB VRAM or 32 GB RAM | None | None | Active | Hardware floor above 3050/M1 |
| **Recall (getrecall.ai)** | Closed, $10/mo | Cloud | Summaries, chat, auto-linking | Cloud | Knowledge graph | Active | Cloud-only; ~60% link accuracy reported |
| **Raindrop.io** | Closed | Cloud | Semantic search, MCP server (Pro) | Cloud collections | None | Active | Cloud, but a usable MCP surface |
| **mymind** | Closed ~$13/mo | Cloud | Auto-tag, OCR, "Same Vibe" | None by design | Visual board | Active | Anti-organization |
| **Are.na** | Closed, open API | Cloud | None | Channels: public/closed/private, collaborators | Channel graph | Active | Best social curation model; no AI, no local |
| **Pearltrees** | Closed | Cloud | Minimal | Public trees | Tree UI | Alive: ~10M claimed users, ~62 staff | Trees aren't dead, but stay niche |
| **Memex (WorldBrain)** | OSS | Local-first extension | Minimal | Was P2P-adjacent, now cloud | None | Zombie | Cautionary tale |
| **Postmarks** | OSS | SQLite, single-user | None | ActivityPub federation | None | Niche | Cheapest "share with friends" primitive alive |
| **Nostr NIP-51 clients** | Open protocol | Relays | None | kind-30003 lists | None | Active | Free always-on relays; crypto-coded audience |
| **Briar + Briar Mailbox** | OSS | Local | None | P2P + store-and-forward mailbox, QR pairing | None | Active | Reference design for sharing with offline peers |
| **Zotero + ZotSeek** | OSS + plugins | Local SQLite | 100% local semantic search + MCP | Zotero groups | None | Active | Plugin-on-someone-else's-store strategy works |

**Closest projects, ranked.** 1. Karakeep (~90% overlap, already at chat). 2. Obsidian + Web Clipper + Smart Connections. 3. SurfSense (RAG engine). 4. Armaria (storage philosophy). 5. Briar/iroh (designs to copy for sharing).

**Fork, contribute, or build?** Forking Karakeep buys a crawler, extensions, mobile apps, importers, MCP server, but it is Next.js + Postgres/SQLite + Meilisearch + Puppeteer, a server product with accounts, AGPL. Grafting Electron + P2P onto it is bigger than writing the viz layer from scratch. **Don't fork. Build; optionally read Karakeep/Raindrop/Linkwarden via API+MCP.**

---

## 3) Per-category notes

**Self-hosted AI bookmarking.** Karakeep 2026 cadence: 0.30 (PDF archives, "Wrapped" statistics, Matter import), 0.31 (LLM OCR, embedding tag suggestions), 0.32 (client-side SingleFile crawling, Safari extension, API scopes), 0.33.1 (semantic + hybrid search, MCP 29 tools, chunked content API), 0.33.2 (SingleFile CLI upload). Pocket died 8 July 2025, data deleted 12 Nov 2025; that refugee flow feeds the category.

**P2P / local-first infra.** iroh reached 1.0 on 15 June 2026, ~200M endpoint connections/month via public relays, ~90% direct. Its **ticket** bundles endpoint + app data into one base32 string that works in QR codes. Ink & Switch **Keyhive** (group access control) + **BeeKEM** (group key agreement) + **Beelay** (sync payloads the server cannot decrypt), FOSDEM 2026, research-grade. Vendor consolidation: Triplit acqui-hired by Supabase (Aug 2025), ElectricSQL joined Databricks (11 Aug 2026). Argument for boring, ownable tech.

**Visualization.** The empty quadrant. Apple **Embedding Atlas** (WebGPU, millions of points, local), **WizMap** (WebGL + workers), **Latent Scope** (local embed→UMAP→cluster→label). **InfraNodus** builds a co-occurrence graph and surfaces "structural gaps" between clusters: the overlap/intersection map, already named.

**Local RAG.** Commoditized (Khoj, SurfSense, Hyperlink, extensions). Do not build RAG as a differentiator.

**Notion import.** No `/export` API endpoint; recursive block walk at 3 req/s; exports drop relations, rollups, formulas, views; Notion-hosted file links are time-limited signed URLs. Obsidian has a $5,000 bounty open for a proper Notion importer. Ship CSV/HTML import first; API import later.

---

## 4) Premise-by-premise critique

### 4.1 P2P between friends: the wrong shape
1. NAT is ~solved, not free: iroh hole-punching works ~9/10 times; disabling relays removes the machinery that makes direct connections work. libp2p browser-to-browser needs a circuit-relay. y-webrtc public signalling servers have gone down.
2. Simultaneity is unsolvable by networking. Briar Mailbox: an always-powered device that stores encrypted messages for offline users and delivers on reconnect. Copy it.
3. Non-technical peers turn every edge case into a support call. Obsidian LiveSync added mandatory signalling relay, TURN path, Coturn starter because users couldn't connect.

HN Jan 2026 "LocalFirst: You Keep Using That Word": "every P2P needs some centralized support"; UX anxiety: "Am I looking at the latest data? Is it safe to close?" Paul Frazee left SSB because it "wasn't scaling from an end-user perspective."

**Recommendation:** transport iroh (QUIC + relay fallback, MIT/Apache); availability via one **mailbox node** you host (€5/mo VPS or a Pi) storing E2EE blobs it cannot read (~2 weeks work); onboarding via an **iroh ticket** invite link/QR; call it "encrypted sync through a mailbox" in the UI, not "P2P".

### 4.2 Local AI on RTX 3050 laptop and M1/16GB
**Embeddings: non-issue.** CPU throughput spans 100x by model/quant: nomic-embed-text ~120 chunks/s on M3 Pro; all-MiniLM ~83 ms latency / 492 MB RAM; EmbeddingGemma ~4 chunks/s on CPU when shipped BF16. 100k links × ~10 chunks = 1M chunks: ~2.5 h at 120/s, ~69 h at 4/s. **Pin model + quant, store the model ID on every vector.**

**Generation: severely constrained; 3050 is the binding case.** 4 GB VRAM → 1B–3B on GPU; 7B only at Q2/Q3 offload; ~28 tok/s reported. M1/16GB: Llama-3.1-8B ~10–14 tok/s, Phi-4-mini 3.8B Q4 ~15–20 tok/s. A 250-token label at 15 tok/s ≈ 17 s. One call per document × 100k ≈ 17+ days. **Envelope: ~1,000–2,000 generation calls per night.**

Consequences: never put an LLM call on the save path (save = URL + extracted text + embedding + extractive lead sentence); accept a quality ceiling for 3B models; **split the runtime**: bundle a small ONNX embedding model (30–100 MB, CPU, everywhere); make generation external/optional (Ollama/LM Studio if present, else cloud key, else extractive-only). Hyperlink (Nexa AI) requires 8 GB VRAM or 32 GB RAM; reference machines are below that.

### 4.3 "Training on the local database", reframed
Fine-tuning has no defensible payoff on a personal corpus (no labeled query–doc pairs). Reframed as reasoning → a **cost** problem. Rule: LLM cost scales with clusters, not documents (arXiv 2502.09667 fixed per-iteration budget; SCYCHIC 2509.19125 bidirectional hierarchical clustering).

**Pipeline:** 1) embed everything; 2) HDBSCAN/UMAP → ~300–800 clusters over 100k (no LLM); 3) one LLM call per cluster to name it + 1-line rationale (~800 calls ≈ 3–6 h locally, once); 4) agglomerate centroids → 2–3 level hierarchy, one call per internal node (~50–100); 5) incremental: new link → nearest cluster (0 calls); re-label only when centroid drifts.

**Tag self-reorganisation:** do not re-tag 100k items. Embed the tag vocabulary (~2–5k strings), cluster it, ~20 LLM calls to propose merges/renames/parent-child, apply mechanically, show a diff, let the user reject. Rejections become negative signal (PaperRouter-Agent, arXiv 2607.11564: similarity-gated feedback from past rejections).

**Do the boring retrieval first:** BM25 + vector fused with Reciprocal Rank Fusion, then cross-encoder rerank of top ~100 (~5 ms + ~50 ms). Add a personal re-ranker over features (recency, domain affinity, tag co-occurrence, clicks, "opened twice"): logistic regression over a few hundred implicit-feedback events, ~200 lines, retrains in ms, explainable.

### 4.4 Web fetching, sharpened by Electron
Headless Chrome is detected; puppeteer-extra-stealth deprecated; FlareSolverr stalled; Cloudflare fingerprints TLS/HTTP2. YouTube PoToken (2025–26) blocks cloud IP ranges. Karakeep's answer: **client-side crawling in the browser extension using SingleFile core** ("perfect for websites that don't like to get crawled... or require authentication"). **Electron adds a hidden `BrowserWindow`** with a real profile, real cookies, residential IP: far less detectable than headless Puppeteer on a VPS; covers the 80% case. Still ship the extension for logged-in sessions. Keep the existing `confidenceScore`/`confidenceReason`; demote search-grounding to last-resort fallback. Bulk re-crawl of 100k links will get a home IP blocked.

### 4.5 Pearltrees-style trees
Pearltrees alive but niche 15 years. BERTopic "scores lowest on navigability because it produces flat topic sets" (TaxCE, arXiv 2608.30614). LLM-generated topic labels frequently preferred over human ones (arXiv 2509.19365). **Synthesis:** auto-generate labels; auto-generate structure as a disposable, query-scoped view; users **pin** branches into persistence. Seed and version it so it doesn't look different tomorrow.

### 4.6 Electron: defensible but expensive
Electron 300–500 MB resident for a React app; Tauri 3–10 MB bundle, ~50 MB RAM, built-in Sidecar. **But Electron is right here because the wedge is a WebGPU embedding map**: Tauri uses OS WebViews (WebView2 / WKWebView / WebKitGTK) → three rendering engines, three WebGPU stories, Linux is where WebGPU viz dies. node-llama-cpp officially supports Electron; hidden-BrowserWindow fetcher only exists in Electron. Costs: native module matrix (better-sqlite3 + sqlite-vec [+ node-llama-cpp]) prebuilds for win-x64/mac-arm64/mac-x64/linux-x64; **code signing ~$400–600/yr** (Windows EV mandatory since June 2023 on FIPS hardware token; check Azure Trusted Signing as a cheaper subscription alternative, unverified); 100k rows need virtualization (TanStack Virtual).

### 4.7 Scale 10k–100k
sqlite-vec at 100k × 384-dim: ~15 s index build, ~4 ms query (k=10), brute force; degrades linearly past 500k. **100k is the sweet spot; no ANN index needed.** Vector RAM: 154 MB at 384-dim, 307 MB at 768-dim. Storage is text and archives: 100k × 30 KB text ≈ 3 GB; SingleFile archives ~500 KB each ≈ 50 GB. **Archives local-only, opt-in, never synced.** Sync metadata + summaries + embeddings (~1 GB). UMAP on 100k points takes minutes on CPU: precompute, cache, recompute nightly; render with a WebGPU scatter layer.

### 4.8 Scope: traps and wedge
Traps: custom P2P networking; Notion API import; "full editing of the whole database" (ship a SQL console + JSON export instead); server-side crawling; mobile apps; bundling generation inference in the installer. **Wedge: the embedding map + cluster statistics + "ask this selection", demoed in 4 weeks.**

### 4.9 Privacy
Free Gemini API keys train Google's models and human reviewers may see content; paid tier doesn't (EEA/UK carve-out). Anthropic API: not used for training, 7-day retention since 14 Sept 2025. Non-AI leaks: fetch itself (home IP → sites), favicons/thumbnails, DNS, search-grounding fallback, cloud embeddings, and with P2P your IP is exposed to peers and relays. Windows Recall lesson: local-only was not sufficient; the index is the attack surface. Table stakes: encrypted-at-rest index, OS keychain for keys, default-on domain exclusion list, visible "what left this device, when, to whom" log.

---

## 5) Out-of-the-box ideas
5.1 **Extension is the crawler; Electron hidden BrowserWindow is the fallback; no server ever fetches.**
5.2 **Sharing as signed encrypted artifacts delivered to a mailbox, not live P2P.** A share = one encrypted bundle (JSONL + extracted text + precomputed embeddings + optional archives), encrypted to the friend's public key, dropped in an iroh-addressed mailbox, fetched when they open the app. Friend gets semantic search without re-running AI. Risk: no live collab, no revocation once read.
5.3 **Git as database and sync engine** (zero infrastructure): one JSON per bookmark + content-addressed blobs (GitSyncMarks does this with three-way merge). Non-technical friends need a GitHub account (mitigable via fine-grained token in invite link).
5.4 **Nostr NIP-51 / ActivityPub for the public layer only.**
5.5 **"Pearltrees" as a query-time projection**: `tree(query, corpus) → outline` from cached cluster labels, disposable; users pin branches.
5.6 **Ship the map before the chat**: UMAP projection in-browser, lasso-select → cluster statistics, theme labels, set operations between clusters, then "ask this selection". InfraNodus structural gap = overlap map.
5.7 **Be a client, not a silo**: read Karakeep MCP, Raindrop MCP, Linkwarden API, plus local SQLite.
5.8 **Invert the AI budget; make provenance a first-class field**: extractive lead sentences + keyphrases instant; real summary only for items opened twice; surface "summarized from: full text / partial / search grounding / URL only". "This one tells you when it's guessing" is a defensible differentiator.

---

## 6) Open questions
1. Pay ~$400–600/yr for code signing? If no, fallback is web app + local server, not unsigned Electron. Check subscription signing services.
2. Bundle inference or require Ollama? Recommended: bundle small ONNX embedding model; generation external/optional/cloud.
3. Which embedding model + quant, pinned? Store model ID on every vector.
4. Sync unit: metadata + summaries + embeddings; archives local, opt-in.
5. Who hosts the mailbox; failure story when it dies (local data survives; sharing pauses).
6. Accept free-tier Gemini keys? Warn loudly, default to local or Anthropic, explicit checkbox naming the training policy.
7. How often may the reorganiser rewrite structure, and can the user always undo? Diff + undo mandatory.
8. Extension in or out? If out, logged-in/bot-walled content is unreachable.
9. What is the 4-week demo? Nomination: the map.

**Sources:** Karakeep repo/releases/discussions #709/MCP/SingleFile docs · iroh FAQ & tickets · Briar Mailbox · HN 46506957 · Ink & Switch Keyhive · Obsidian LiveSync · Smart Connections · Linkwarden AI tagging · Anytype any-sync · Armaria · Postmarks · NIP-51 · GitSyncMarks · Notion request-limits · obsidian-importer#421 · youtube-transcript-api#511 · node-llama-cpp Electron guide · Electron code-signing docs · sqlite-vec · arXiv 2502.09667, 2509.19125, 2608.30614, 2509.19365, 2607.11564, 2406.00010, 2505.06386 · InfraNodus · Anthropic training policy · SurfSense · ZotSeek · transformers.js WebGPU · libp2p WebRTC · y-webrtc#43
