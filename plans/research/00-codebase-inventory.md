# Codebase inventory — AI-bookmark-manager and sibling projects (2026-09-12)

## Part A — AI-bookmark-manager (C:\Users\b.recoules\Downloads\_projets\AI-bookmark-manager)

Stack: React 19 + Vite 6 + Express 5, run via `tsx server.ts` (port 3000). Remote: https://github.com/b2renger/AI-bookmark-manager.git, branch `main`, working tree clean. Started inside Google AI Studio / Firebase Studio scaffolding. No test script; both `bun.lock` and `package-lock.json` present.

### Import (`components/UrlInput.tsx`)
Single textarea, split on newline, per line: Netscape bookmark HTML `<a href=... add_date=...>` regex (Unix seconds → ISO), fallback href-only regex, other `<`-lines discarded, plain URLs with numbered/bullet prefix stripping. No file picker, no JSON/CSV import. Dedupe lives in `App.tsx` `handleProcessUrls`: `existingUrls` Set over non-error bookmarks, `stripUtmParams()` normalisation, exact-match skip. `onOpenSettings` prop is now dead.

### UI
- `BookmarkItem.tsx` (23 KB): `EditableField` (click-to-edit title/summary), keyword add/remove (case-insensitive dedupe), `ConfidenceBadge` (≥85 High / ≥60 Moderate / <60 Low + reason tooltip), `PlatformBadge` (YouTube/Shorts/Playlist, Threads, X, GitHub, Article, Web), status-driven rendering, YouTube thumbnail, selection checkbox, `sources[]` list.
- `BookmarkList.tsx`: owns `searchQuery`, `platformFilter`, `sortOption`; search over title/url/summary/author/keywords; platform pills with counts; sort by date/confidence/title; avg confidence badge; select-all scoped to filtered set.
- `BulkActionBar.tsx`: floating bar, count + clear + bulk keyword append.
- `Header.tsx`: root copy and `components/Header.tsx` are byte-identical; only `components/` one is imported.
- `SettingsModal.tsx` (18.5 KB): Gemini model select, X bearer token + test, Notion token + test, proxy presets (built-in `/api/proxy`, corsproxy.io, CodeTabs, placeholder Worker, cors-anywhere).
- `NotionSyncModal.tsx`: loading → select → syncing → complete/error state machine, progress, success/failed/skipped, "Sync Anyway", prune.
- `ApiKeySetup.tsx`: AI Studio "Select API Key" gate (not a real key form).
- `common/Icons.tsx` (hand SVGs) coexists with `lucide-react`. `common/Spinner.tsx` trivial.
- Styling: Tailwind via CDN `<script>` in `index.html` (no PostCSS). `index.html` also has a browser importmap to `aistudiocdn.com` for react/react-dom/@google/genai/uuid.
- State: all in `App.tsx` `useState` (bookmarks, keys, notion config, model, selection Set, loading/error, dark mode, modals). No store/context.

### Services
- `services/geminiService.ts`: `fetchTweetContext` (X API → syndication → oEmbed), `fetchThreadsContext` (oEmbed → meta scrape), `fetchYouTubeContext` (oEmbed → HTML meta + playlist titles), `fetchWebContext` (OpenGraph); `generateBookmarksBatch` posts urls+contexts to `/api/gemini/generate-bookmarks` with 429 backoff and fallback records.
- `server.ts`: server-side Gemini call with `googleSearch` grounding, 5-step model/tool-shedding strategy list, JSON extraction, per-URL post-processing (platform detection, YouTube thumbnail, confidence fallback, publication date validation); generic `/api/proxy` POST forwarder.
- `services/notionService.ts`: `notionFetch` (429 Retry-After backoff, 5 retries), `getAccessibleDatabases`, `ensureDatabaseSchema` (URL/Description/Keywords/Date/Platform), `exportToNotion` (batched URL dedupe query, 1.5 s per insert, children blocks for sources).
- `components/ExportButton.tsx`: JSON, CSV, Markdown, styled HTML, Netscape bookmark file exports.
- `vite.config.ts`: `define`s `process.env.API_KEY` and `process.env.GEMINI_API_KEY` from `.env` (baked into client bundle); alias `@` → root. `.gitignore` lacks `.env`.
- 14 root `test-*` files: scratch probes of public CORS proxies against Notion API and Gemini model ids; never wired to a runner.

### Reusable vs discard
Reusable: dedupe + `stripUtmParams`; Netscape parser; the four context extractors + server post-processing; `BookmarkList` search/filter/sort; `EditableField`, `ConfidenceBadge`, `PlatformBadge`; `BulkActionBar`; Icons; `notionService` client/backoff/property mapping; exporters; `types.ts` Bookmark + status shape.
Discard: localStorage persistence; CDN importmap + Tailwind CDN; baked API key; public CORS presets; `ApiKeySetup`; duplicate root `Header.tsx`; `test-*` files; X bearer-token flow; `.idx/` artifacts.

## Part B — Sibling projects

**artlux** (`C:\Users\b.recoules\Downloads\_projets\artlux`): Electron ^42.4.1, electron-builder ^26.15.3 (win: NSIS perMachine + `build/installer.nsh`, extraResources vc_redist/NDI; mac: dmg; linux: AppImage; output `release/`; publish GitHub Releases owner urbandronedesign), electron-vite ^5.0.0, `src/main` / `src/preload` / `src/renderer`, React 19, Tailwind via PostCSS. Native addons are Rust crates via cargo + @napi-rs/cli. Tests: bespoke `test:*` scripts (tsc one file → node), `verify:*` static checks; no vitest/playwright. `docs:capture` uses puppeteer-core attached via CDP to the running Electron renderer for screenshots. Signing: Windows none (SmartScreen warnings); macOS `mac.identity: "-"` ad-hoc only, no notarization, `hardenedRuntime:false`; `scripts/verify-mac-signature.cjs` tripwire (electron-builder flips fuses after afterPack, which broke earlier ad-hoc signing). Auto-update: `electron-updater` in `src/main/updater.ts`, `autoDownload=false`, `autoInstallOnAppQuit=false`, events forwarded to renderer, explicit check/download/install IPC, background check 4 s after startup. `plans/SEQUENCING.md`: numbered Waves, one branch per wave (`wave-<n>-<slug>`), ordered checklist linking sibling `plans/*.md`, ASCII dependency graph, merge to main only after human tests + go-ahead.

**WhisperLive** (package name "rtranslate"): the user's own Electron app for local GPU live FR↔EN transcription/translation. Engines out-of-process over a localhost WebSocket contract (`docs/engine-contract.md`), A/B on branches `engine/whisperlivekit` (Python+CUDA) vs `engine/qvac` (whisper.cpp/Parakeet + nmtcpp over Vulkan, ~800 MB, no Python). Ships a `mock` engine and a profiling harness (`spike/profile.mjs`). electron-builder for Windows.

**Harmonicizer**: Vite + React 19 SPA, Vitest. **granul8-main**: zero-dependency vanilla JS, `node --test`. **WebXR_exp**: static Three.js/WebXR experiments.

## Part C — Environment (this machine)
Node v24.15.0, npm 11.12.1, no bun, Python 3.13.14, **no rustc/cargo**. Ollama 0.30.6 at `%LOCALAPPDATA%\Programs\Ollama`, 15 models pulled (phi3:mini 2.2 GB, gemma3:4b 3.3 GB, gemma3n 7.5 GB, gemma4:12b-it-qat 7.2 GB, llama3.1:8b 4.9 GB, mistral 4.1 GB, deepseek-r1:8b, qwen3.6:27b, gemma4:26b, codellama...). LM Studio profile in `~/.cache/lm-studio`. GPU: NVIDIA GeForce RTX 3050 Ti Laptop (4 GB VRAM) + Intel UHD. RAM ≈ 31.7 GiB. Disk C: ≈159 GiB free of 1.56 TiB.
