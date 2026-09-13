> Part of the Cairn v2 plan. Read `plans/SEQUENCING.md` first, then this file, then the previous phase's rig-test record in `plans/rig-tests/`. Durations are working days for a solo developer. Decisions referenced as "decision N" live in `plans/research/03-the-pragmatic.md`.

# P7 — signing, updates, polish → **v1**

**Branch** `v2/p7-release` · **Duration** 10–15 days · **Depends on** P0–P6. **External calendar dependency:** Apple Developer enrolment started in P4.

**Goal.** Turn a working app into something a non-technical friend installs, updates and recovers from without you on the phone.

**The one thing that must be true at the end.** A friend double-clicks the installer on a machine that has never seen the app and is searching their own bookmarks ten minutes later, with no Gatekeeper or SmartScreen dead-end.

### Deliverables

- `apps/desktop/electron-builder.yml` — NSIS x64 + portable ZIP; notarized arm64 dmg; best-effort x64 dmg; AppImage + .deb.
- `apps/desktop/src/main/updater.ts` [port: `artlux/src/main/updater.ts`], `scripts/verify-mac-signature.cjs` [port: artlux].
- `.github/workflows/release.yml` — tag push → signed installers + `latest.yml` / `latest-mac.yml` → GitHub Releases.
- `apps/desktop/src/renderer/screens/` — `Onboarding`, `EgressLog` (promoted), `About`.
- `packages/core/src/export/` — full export, streamed.
- `docs/` — `install-windows.{fr,en}.md`, `install-macos.{fr,en}.md`, `recovery.md`, `privacy.{fr,en}.md`, `smartscreen.{fr,en}.md`.

### Ordered tasks

1. Apple Developer certificates into CI secrets; `notarytool` wired into electron-builder — a notarized dmg opens on a Mac that has never seen the app, with no right-click-open workaround.
2. Port artlux's fuses-vs-signature tripwire and run it in CI — `verify-mac-signature` fails a deliberately broken build.
3. Windows: unsigned NSIS + portable ZIP + a bilingual SmartScreen explainer page linked from the download — a non-technical tester installs from the written instructions without calling.
4. Linux AppImage + .deb — both install on one Ubuntu VM; the AppImage runs without a sandbox flag.
5. `electron-updater` with `autoDownload: false` and IPC-driven check / download / install, background check 4 s after startup [port: artlux] — manual 0.1.0 → 0.1.1 update on both rigs.
6. Release workflow dry run on a tag — installers plus update manifests published and consumed by step 5.
7. Onboarding: language, the "no cloud by default" statement, model download choice with the *measured* P1/P4 times, and the first import source — manual with a real non-technical tester, start to first search timed.
8. Default domain exclusion list shipped as an editable data file (banking, health, webmail, cloud drives, `localhost`, private IP ranges, `*.local`) — `exclusions.test.ts`: a matching URL stores URL + title only, is never fetched and never sent to a cloud provider.
9. Egress log promoted to a top-level screen with CSV export — manual: a full session's cloud, fetch and peer activity is legible to a non-developer.
10. Full export — `bookmarks.json`, `bookmarks.html`, `markdown/`, `library.db`, `snapshots/` — fully streamed — 100k export < 5 min; round-trip row and content-hash equality.
11. `docs/recovery.md`: a plain `sqlite3` recipe to extract everything without the app — followed successfully by the tester on a copied `library.db`.
12. i18n completeness pass plus a pseudo-locale truncation check — 0 missing keys; no clipped label at 125% OS scaling.
13. Local-only error reporting (rotating log file + "reveal in folder"); no telemetry of any kind — manual; `rg "analytics|telemetry"` returns nothing live.
14. Performance pass on the packaged build (not the dev build): cold start, first paint, memory ceiling at 100k — cold start < 4 s on both rigs.
15. Licence audit of every dependency (MIT / Apache-2.0 / ISC / BSD only; Cosmograph absent; UpSet.js absent) — `npm run licence-check` green in CI.
16. Playwright smoke #8 — an install-shaped run: fresh `userData` → onboarding → import → search → map.
17. Tag `v1.0.0`; write `plans/p7-release.md` with every measured number from P0–P7.

### Automated tests added

Licence-check CI job. Packaged-build smoke #8 (run against the built artifact, not the dev server). Update-manifest consumption test. The full perf suite re-run against the packaged build, replacing the dev-build baselines in `plans/`.

### Human rig test — P7

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Notes |
|---|---|---|---|---|---|
| 1 | **COLD:** on a clean OS user account, download and install from the release artifact | Installs with no developer tooling; Gatekeeper/SmartScreen path documented and survivable | install ___ s · SmartScreen clicks ___ · Gatekeeper prompts ___ | install ___ s · Gatekeeper prompts ___ | |
| 2 | Complete onboarding to the first successful search | A non-technical tester needs no help | start→first search ___ min · help requests ___ | start→first search ___ min · help requests ___ | The v1 promise |
| 3 | Cold start the packaged app three times | Consistent, no first-run penalty after the first | cold start ___ s (avg of 3) · first paint ___ s | cold start ___ s · first paint ___ s | |
| 4 | **SCALE:** open the 100k fixture in the packaged build, search, map, lasso | All P0–P2 numbers hold within 20% of the dev build | search p95 ___ ms · map ___ fps · RSS ___ MB | search p95 ___ ms · map ___ fps · RSS ___ MB | Supersedes dev numbers |
| 5 | **SCALE:** run a full export of 100k and re-import into a fresh install | Round-trip equal; export streams without a memory spike | export ___ min · archive ___ GB · peak RSS ___ MB · row delta ___ | export ___ min · archive ___ GB · peak RSS ___ MB · row delta ___ | |
| 6 | Trigger an in-app update from 1.0.0 to 1.0.1 | Update downloads on explicit consent and installs | check ___ s · download ___ s · restart ___ s | check ___ s · download ___ s · restart ___ s | |
| 7 | Add a banking URL and a `localhost` URL | Stored as URL + title only; never fetched; no egress row | fetched y/n ___ (must be n) · egress rows ___ (must be 0) | fetched y/n ___ · egress rows ___ | |
| 8 | Read the egress log after a normal day of use | A non-developer can explain every row | rows ___ · unexplainable ___ (must be 0) | rows ___ · unexplainable ___ | |
| 9 | **FAILURE:** first launch with the network off | App is fully usable offline; no blocking dialog, no spinner forever | time to usable ___ s · blocking dialogs ___ (must be 0) | time to usable ___ s · blocking dialogs ___ | |
| 10 | **FAILURE:** make the update feed unreachable, then recover `library.db` with the `docs/recovery.md` sqlite3 recipe | Update failure is silent-but-logged; recovery recipe yields a readable CSV | update error handled y/n ___ · recovery ___ min | update error handled y/n ___ · recovery ___ min | |

**Sign-off:** date ______ · tester ______ · **go / no-go — this is the v1 gate** ______

**Numbers feed back into:** step 1's SmartScreen click count and step 2's help-request count decide whether to buy the Windows OV certificate now or stay on the explainer (decision 13); step 4's packaged-build numbers **replace** every dev-build number recorded in P0–P6; step 2 is the number quoted to friends.

### Exit criteria

- Notarized macOS build opens on a virgin Mac; Windows explainer path verified by a non-technical tester.
- Auto-update works end to end on both rigs from a real GitHub Release.
- Onboarding takes a friend from installer to first search unaided.
- Exclusion list, egress log and recovery recipe all verified by hand.
- Licence audit green; `v1.0.0` tagged and merged to `main` (the single v1 merge of decision 14).

### What could go wrong

- **Notarization rejected repeatedly** or the OV token process stalls (Expert risk #8). *Fallback:* decision 13's reverse-if — ship portable ZIP + AppImage only rather than delaying v1.
- **The €99 Apple enrolment was started too late.** *Fallback:* this is why task 1 of P4 starts it; if it still slips, ship Windows + Linux first and add the Mac build as 1.0.1.
- **Packaged-build performance is materially worse than dev** (asar, unpacked native modules, ASLR). *Fallback:* step 4 is the gate; `asarUnpack` the native modules and re-measure before tagging.
- **A friend's antivirus quarantines the unsigned NSIS.** *Fallback:* the portable ZIP is the documented second path; a quarantine event is a data point for the OV purchase decision.
