> Part of the Cairn v2 plan. Read `plans/SEQUENCING.md` first, then this file, then the previous phase's rig-test record in `plans/rig-tests/`. Durations are working days for a solo developer. Decisions referenced as "decision N" live in `plans/research/03-the-pragmatic.md`.

# P3 — acquisition and provenance

**Branch** `v2/p3-acquisition` · **Duration** 12–18 days · **Depends on** P0 (schema, jobs); P2 for the badge surfaces

**Goal.** Put real content behind every bookmark: tiers 0, 1, 2, 3, 4, 6 and 8, with per-hostname rate limiting, robots compliance, content versioning, visible provenance and opt-in content-addressed snapshots.

**The one thing that must be true at the end.** Point it at 2,000 of the user's real URLs, walk away, and come back to ≥ 75% of them carrying extracted text and a provenance badge that says exactly how it was obtained — with no hard errors anywhere.

### Deliverables

- `packages/core/src/acquire/` — `router`, `rateLimiter`, `robots`, `tiers/{api,shims,fetchExtract,pdf,archive,cloud,fail}`.
- `apps/desktop/src/main/renderTier.ts` — hidden `BrowserWindow` (tier 4).
- `packages/core/src/snapshot/` — BLAKE3 content addressing, zstd, 5 GB LRU store.
- `packages/ui/src/ProvenanceBadge.tsx`; `apps/desktop/src/renderer/screens/AcquisitionQueue.tsx`.
- `fixtures/extractors/<domain>/*.html` + `.expected.json` (~40 domains).
- `.github/workflows/canary.yml` — weekly live canary, allowed to fail loudly.
- `docs/acquisition.md`.

### Ordered tasks

1. Hostname router selecting a tier, recording `acquisitionMethod` on `content_versions`, stopping at first success — `router.test.ts`: 30 hostnames map to the expected tier.
2. Tier 0 structured APIs (GitHub REST, arXiv, HN Firebase, Reddit `.json`, Bluesky `getPostThread`, Mastodon, Wikipedia REST) — one golden fixture per source.
3. Tier 1 YouTube via `youtubei.js` (metadata + captions) [port: `services/geminiService.ts#fetchYouTubeContext`] — golden fixture asserts title, channel, duration, captions present.
4. Tier 1 X via FxEmbed / syndication and Threads via oEmbed [port: `#fetchTweetContext`, `#fetchThreadsContext`]; the bearer-token flow is deleted — golden fixtures for both.
5. Tier 2 `undici` (real UA, `Accept-Language: fr,en`) → `defuddle` → `@mozilla/readability` fallback, parsed with `linkedom`, merged with OpenGraph [port: `#fetchWebContext`] — the 40-domain golden suite passes ≥ 90%.
6. Tier 3 PDFs via `unpdf`; < 100 chars/page ⇒ scanned ⇒ `tesseract.js` `fra+eng` behind a flag — `pdf.test.ts`: text plus page-anchored offsets on 5 PDFs, one scanned.
7. Tier 4 hidden `BrowserWindow`: real session + UA, wait for network-idle, `executeJavaScript(outerHTML)` → tier 2 extraction — manual on 10 known tier-2 failures, ≥ 6 recovered.
8. Tier 6 Wayback availability API → archived HTML → tier 2 — `wayback.test.ts` against a recorded response.
9. Tier 8 graceful failure: URL + OG tags + low confidence + reason, never a thrown error [port: `server.ts` confidence-fallback post-processing] — `fail.test.ts`: never throws on 20 malformed inputs.
10. Tier 7 cloud extraction present but **off**, requiring a per-action confirmation and writing an `egress_log` row — `egress.test.ts`: zero rows while off, exactly one row per confirmed call.
11. Rate limiter: 1 req / 2 s per hostname with jitter, global concurrency 4, bulk backfill capped at 2,000 URLs/day and explicitly started — `ratelimit.test.ts` with a fake clock; the cap is enforced across restarts.
12. robots.txt honoured for tiers 2 and 4, with a per-domain override that writes a log line — `robots.test.ts`: allow / deny / override paths.
13. Content versioning: one `content_versions` row per fetch (tier, `http_status`, lang, text, `text_hash`, `snapshot_hash`, confidence, reason) [port: `server.ts` platform + thumbnail post-processing] — `versions.test.ts`: re-fetch appends a version, never overwrites.
14. Snapshots: BLAKE3-addressed `.html.zst`, opt-in per collection, ~2 MB/page target, 5 GB LRU eviction — `snapshot.test.ts`: identical bytes → identical path; LRU evicts least-recently-used first.
15. Acquisition queue screen: per-item tier, retry count, failure reason, pause/resume, re-run failed — manual: pause mid-run, resume, zero duplicate fetches.
16. Provenance badge in the library row, the map tooltip and the detail pane [port: `ConfidenceBadge`, `PlatformBadge`] — visible on 100% of rows, including tier-8 failures.
17. Re-extract from stored raw bytes when the extractor improves (no re-fetch) — `reextract.test.ts`: a new extractor version produces a new `content_versions` row from the stored snapshot.
18. Weekly live canary over the 40 fixture domains, non-blocking, posting a diff summary — one canary run completes and reports.
19. Playwright smoke #4 — add a URL → tier-2 extraction runs → text present and a badge rendered.

### Automated tests added

**Golden extractor fixtures (~40 domains) start here**, built from raw fetched bytes, plus the **weekly live canary** allowed to fail loudly without blocking. Rate-limiter fake-clock tests. Snapshot CAS and LRU tests. Smoke #4.

### Human rig test — P3

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Notes |
|---|---|---|---|---|---|
| 1 | **COLD:** fresh `userData` and a fresh browser profile inside the app — acquire 20 mixed real URLs (article, YouTube, X, PDF, GitHub, paywalled) | Every item ends in a terminal state with a badge; none errors out | success ___ /20 · total ___ s · tiers used ___ | success ___ /20 · total ___ s · tiers used ___ | |
| 2 | Check the tier distribution in the queue screen | Tier 0/1 used where expected, tier 4 only after tier 2 failed | tier2 ___ · tier4 ___ · tier8 ___ | tier2 ___ · tier4 ___ · tier8 ___ | |
| 3 | Acquire one known bot-walled page with tier 4 | Text extracted, badge reads `rendu / rendered` | ___ s · window peak RSS ___ MB | ___ s · window peak RSS ___ MB | |
| 4 | **SCALE:** start a 2,000-URL backfill from the real corpus and let it run 2 h | Rate limiter holds; no hostname exceeds 1 req / 2 s | throughput ___ URL/min · success ___ % · 429s ___ | throughput ___ URL/min · success ___ % · 429s ___ | Gates decision 7 |
| 5 | **SCALE:** during step 4, use search and the map | UI stays responsive; queue yields | search p95 ___ ms · map ___ fps | search p95 ___ ms · map ___ fps | |
| 6 | Enable snapshots for one collection, acquire 200 pages | Snapshots written content-addressed, dedup on identical pages | avg ___ KB/page · store ___ MB · dedup hits ___ | avg ___ KB/page · store ___ MB · dedup hits ___ | Sizes the 5 GB cap |
| 7 | **FAILURE:** turn the network off mid-backfill, wait 60 s, turn it back on | Queue pauses with a bilingual reason, resumes without duplicates | pause ___ s · duplicates ___ (must be 0) | pause ___ s · duplicates ___ | |
| 8 | **FAILURE:** acquire a URL behind a Cloudflare challenge and a 403 | Falls through to tier 6 then tier 8; badge explains; no crash | time to terminal ___ s · final tier ___ | time to terminal ___ s · final tier ___ | |
| 9 | **FAILURE:** acquire a corrupt PDF and a 400 MB PDF | Both end in tier 8 with a reason; memory does not spike | peak RSS ___ MB · time ___ s | peak RSS ___ MB · time ___ s | |
| 10 | Check `egress_log` after the session | Every third-party fetch has a row with host, purpose, bytes | rows ___ · unexplained rows ___ (must be 0) | rows ___ · unexplained rows ___ | |

**Sign-off:** date ______ · tester ______ · **go / no-go** ______

**Numbers feed back into:** step 4's tier 2+4 success rate fires or clears decision 7's reverse-if (pull the MV3 extension into v1); step 6's KB/page sets the snapshot LRU cap and the P6 bundle-size warning threshold; step 4's throughput sets the honest ETA shown when a friend imports 10,000 links.

### Exit criteria

- ≥ 75% of the real corpus acquires with extracted text; no URL produces a hard error.
- 40 golden fixtures green; the canary workflow runs weekly and reports.
- Rate limit and the 2,000/day bulk cap enforced across restarts.
- Every bookmark shows a provenance badge and a confidence reason.
- Snapshots opt-in, content-addressed, LRU-capped; never included in a bundle without confirmation.

### What could go wrong

- **Extractor rot** — YouTube PoToken, X syndication changes, Threads oEmbed removal (Expert risk #2, Doubtful §4.4). *Fallback:* the tier chain never hard-fails; the canary tells you which shim died; tier 4 and, later, P8's extension cover the gap.
- **The home IP gets blocked** by a large host during the backfill. *Fallback:* the 1 req / 2 s + 2,000/day cap is deliberately conservative; if it still happens, lower concurrency to 2 and add a per-domain daily cap.
- **Tier 4 is detected anyway** on the hardest sites. *Fallback:* accept it — tier 4 was always the 80% answer; the paywalled remainder is P8's job, and step 4's number decides whether P8 moves into v1.
- **Snapshots blow the disk** on a user who enables them library-wide. *Fallback:* the 5 GB LRU is enforced in the writer, not the UI, and the enable dialog names the projected size from step 6's measured KB/page.
