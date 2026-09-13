> Part of the Cairn v2 plan. Read `plans/SEQUENCING.md` first, then this file, then the previous phase's rig-test record in `plans/rig-tests/`. Durations are working days for a solo developer. Decisions referenced as "decision N" live in `plans/research/03-the-pragmatic.md`.

# P8 — MV3 extension (v2 opens)

**Branch** `v2/p8-extension` · **Duration** 8–12 days · **Depends on** P7 (a released app to pair with), P3 (the tier contract)

**Goal.** Ship the only reliable fetcher for logged-in and paywalled content: an MV3 extension that posts the rendered, authenticated DOM to the desktop app over loopback.

**The one thing that must be true at the end.** A page behind a login that tier 4 cannot get is saved with full text, in one click, from the browser the user was already in.

### Deliverables

- `apps/extension/` — MV3 manifest, background service worker, content script, popup, options (Vite build for Chrome / Edge / Firefox).
- `apps/desktop/src/main/captureServer.ts` — `127.0.0.1:<port>/capture`, per-install shared secret, origin check.
- `packages/ui/src/pairing/PairingDialog.tsx`.
- `docs/extension.{fr,en}.md`, store listing assets.

### Ordered tasks

1. MV3 manifest and build pipeline — loads unpacked in Chrome, Edge and Firefox.
2. Loopback capture server bound to `127.0.0.1` with a per-install shared secret and an origin check — `capture.test.ts` rejects a wrong secret, a non-loopback origin and an oversized body.
3. Pairing: the app shows a code, the extension stores the secret in `chrome.storage.local` — manual on both rigs, including re-pairing after a reinstall.
4. Content script serialising the live DOM with SingleFile-style inlining (MIT-compatible code only; no Puppeteer dependency) — golden fixtures on 5 logged-in-shaped pages.
5. Tier 5 registered in the acquisition router and badged `extension` — `router.test.ts`.
6. Popup: save, choose collection, add tags, show a confirmed "enregistré" state — manual.
7. Context-menu "save link" and "save selection as note" — manual.
8. Offline queue: if the app is not running, hold captures in the extension and flush on reconnect — manual: save 5 pages with the app closed, open the app, all 5 arrive exactly once.
9. Payload cap and truncation policy matching the snapshot budget — `capture.test.ts` at 2 MB and at 12 MB.
10. FR/EN extension strings sharing the app's locale files — manual in both locales.
11. Sideload instructions plus store submission preparation — a non-technical tester installs from the written instructions unaided.
12. Playwright smoke #9 — POST a fixture payload to the capture endpoint → a bookmark exists with `acquisitionMethod = extension`.

### Automated tests added

Capture-server auth and size tests. Extension golden DOM fixtures added to the P3 suite. Smoke #9.

### Human rig test — P8

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Notes |
|---|---|---|---|---|---|
| 1 | **COLD:** fresh browser profile, fresh app `userData` — install the extension and pair | Pairing succeeds from the written instructions alone | install→paired ___ min · help requests ___ | install→paired ___ min · help requests ___ | |
| 2 | Save 10 ordinary pages from the popup | All 10 arrive with full text | success ___ /10 · avg ___ s · avg payload ___ KB | success ___ /10 · avg ___ s · avg payload ___ KB | |
| 3 | Save 5 pages that tier 4 failed on in P3 | Extension recovers pages the app could not | recovered ___ /5 | recovered ___ /5 | Gates tier-4 demotion |
| 4 | **SCALE:** save 50 pages in one browsing session | App stays responsive; queue drains; no duplicates | app RSS ___ MB · queue drain ___ s · duplicates ___ | app RSS ___ MB · queue drain ___ s · duplicates ___ | |
| 5 | Save a very heavy page (long article with many images) | Payload capped and truncation stated, not silently dropped | payload ___ MB · capped y/n ___ | payload ___ MB · capped y/n ___ | |
| 6 | Save from a logged-in account page | Authenticated content captured; no credentials stored anywhere | text captured y/n ___ · credential strings in DB ___ (must be 0) | text captured y/n ___ · credential strings ___ | |
| 7 | Check the egress log after the session | Loopback captures are logged as local, not as egress | mislabelled rows ___ (must be 0) | mislabelled rows ___ | |
| 8 | **FAILURE:** close the app, save 5 pages, reopen the app | All 5 flush exactly once | arrived ___ /5 · duplicates ___ | arrived ___ /5 · duplicates ___ | |
| 9 | **FAILURE:** point the extension at a wrong secret | Rejected with a clear re-pair prompt; no partial write | rejected y/n ___ · rows written ___ (must be 0) | rejected y/n ___ · rows written ___ | |
| 10 | **FAILURE:** another local process POSTs to the capture port | Rejected on origin + secret; one log line | rejected y/n ___ | rejected y/n ___ | |

**Sign-off:** date ______ · tester ______ · **go / no-go** ______

**Numbers feed back into:** step 3's recovery count decides whether tier 4 can be demoted to a fallback (simplifying the acquisition router); step 2/5's payload sizes confirm or raise the 2 MB snapshot budget from P3.

### Exit criteria

- Pairing works unaided on both rigs from the written instructions.
- Extension recovers pages tier 4 could not, with a measured delta.
- Offline queue flushes exactly once; no duplicates under any tested sequence.
- Capture endpoint rejects wrong secrets, non-loopback origins and oversized bodies.
- FR/EN parity with the desktop app.

### What could go wrong

- **Store review rejects the extension** or takes weeks. *Fallback:* sideload instructions are a first-class deliverable, not a stopgap; the app works without the extension.
- **MV3 service-worker lifecycle drops queued captures.** *Fallback:* persist the queue in `chrome.storage.local` on every enqueue, not on a timer; rig step 8 is the proof.
- **Users install the extension without the app.** *Fallback:* the popup detects no app and links to the installer in the right language.
