> Part of the Cairn v2 plan. Read `plans/SEQUENCING.md` first, then this file, then the previous phase's rig-test record in `plans/rig-tests/`. Durations are working days for a solo developer. Decisions referenced as "decision N" live in `plans/research/03-the-pragmatic.md`.

# P0 — foundation

**Branch** `v2/p0-foundation` · **Duration** 12–18 days · **Depends on** nothing (cut from `v2-local-first`, itself cut from `main`)

**Goal.** Turn the AI Studio SPA into an Electron workspace monorepo with a real SQLite schema, the `applyOp` mutation layer, the importer set, and FR/EN i18n from the first screen. Every later phase is a feature bolted to this skeleton, so nothing here may be "provisional".

**The one thing that must be true at the end.** A throwaway unsigned installer, installed on both rigs, imports the user's real Netscape export *and* opens `fixtures/100k.db`, lists 100,000 rows in a virtualised table, and full-text searches them — in French, with diacritics folded.

### Deliverables

- `apps/desktop/` — electron-vite 5 + electron-builder 26 scaffold, `src/main | src/preload | src/renderer`, `contextIsolation` on, `sandbox` on, `nodeIntegration` off, narrow `contextBridge`.
- `packages/core/src/schema/` — migration runner + schema v1 (the 17 entities of decision 8).
- `packages/core/src/ops/` — `applyOp`, HLC clock, actor identity placeholder, `ops` table writer.
- `packages/core/src/ids/` — UUIDv7, fractional index helpers.
- `packages/core/src/url/` — normalisation + dedupe.
- `packages/core/src/import/` — netscape, chromium, firefox, raindrop, karakeep, pocket, csv-mapper.
- `packages/core/src/export/` — `bookmarks.json` round-trip (the contract).
- `packages/core/src/i18n/` + `locales/{fr,en}.json`.
- `packages/ui/` — ported presentational components.
- `apps/desktop/src/renderer/screens/` — `LibraryTable`, `ImportWizard`, `SettingsScreen`.
- `apps/extension/` — placeholder package only (built in P8).
- `tools/fixture-gen/` → `fixtures/100k.db`.
- `plans/SEQUENCING.md`, `plans/p0-foundation.md`, `plans/rig-tests/TEMPLATE.md`.
- `.github/workflows/ci.yml`, `docs/SECURITY.md`.

### Ordered tasks

1. First commit: add `.env` to `.gitignore`, rotate the Gemini key, remove the `vite.config.ts` key `define`, delete the 14 `test-*` files, `ApiKeySetup.tsx`, the duplicate root `Header.tsx`, `bun.lock`, `.idx/` — verify `rg "AIza" -- .` returns 0 and the rotation is noted in `docs/SECURITY.md`.
2. Cut `v2-local-first`; create npm workspaces (Node 24 / npm 11); move the current app to `legacy/` untouched — `npm run build` green across all workspaces.
3. Scaffold `apps/desktop` from the artlux pattern [port: `artlux/electron.vite.config.ts`, `artlux/src/main/index.ts`] — `npm run dev` opens a window with renderer HMR.
4. ESLint `no-restricted-imports` banning `node:*` and `electron` inside `packages/core` — `core-purity.test.ts` fails on a deliberate `import fs from 'node:fs'`.
5. better-sqlite3 bootstrap with the decision-8 pragmas (WAL, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`, `mmap_size=268435456`) + migration runner — `migrations.test.ts` applies up and down on `:memory:`.
6. Schema v1: all entities, UUIDv7 PKs, `collection_id` on every shareable row, `tree_nodes.frac_index`, `ops` and `runs` first-class — `schema.test.ts` asserts zero `AUTOINCREMENT` and `collection_id` present on every shareable table.
7. `applyOp(op)` with `(actor_pubkey, hlc, entity, field, value)` and per-field LWW; no feature code may `UPDATE` directly — `applyOp.test.ts` shows shuffled op order converges to the higher HLC; `no-direct-update.test.ts` greps the repo for raw `UPDATE` outside `ops/`.
8. FTS5 external-content tables + triggers, `unicode61 remove_diacritics 2`, query-side FR stem map — `fts.test.ts`: "café" ↔ "cafe" match both directions.
9. Netscape importer, folders → tags [port: `components/UrlInput.tsx#handleSubmit`] — `netscape.test.ts` on a 5k-entry fixture: count, `ADD_DATE` → ISO, folder path → tag path.
10. URL normalisation + dedupe [port: `App.tsx#stripUtmParams`, `App.tsx#handleProcessUrls`] — `normalise.test.ts` covers 20 UTM / fragment / trailing-slash / punycode cases.
11. Chromium live-JSON and Firefox `places.sqlite` importers, copy-then-read — manual check against real profiles on both rigs, no path prompt on the default install.
12. Generic CSV/JSON column mapper + mapper UI, with Raindrop / Karakeep / Pocket as thin adapters over it — `mapper.test.ts` maps a 6-column CSV to the canonical shape; each adapter has one fixture.
13. Import inside one `db.transaction()` with a dedupe report rendered *before* commit — 100k import < 60 s on the Windows rig (CI perf assertion).
14. Virtualised library table with search / platform filter / sort [port: `BookmarkList.tsx`] plus `EditableField`, `ConfidenceBadge`, `PlatformBadge`, `BulkActionBar`, `Icons` into `packages/ui` — 100k rows scroll at ≥ 50 fps.
15. i18next + react-i18next wiring, FR default, EN parity; `i18n-lint` script — CI fails on one deliberately hardcoded string.
16. `tools/fixture-gen`: 100k bookmarks with realistic domain / date / tag / language distributions, chunk placeholders, fixed seed — regenerating with the same seed produces an identical `text_hash` set.
17. `bookmarks.json` export + re-import round trip [port: `components/ExportButton.tsx`] — `roundtrip.test.ts`: `import(export(db))` equals `db` by content hash.
18. Playwright `_electron` smoke #1 — launch, import a 200-link HTML file, assert row count; green in CI and on both rigs.
19. Unsigned NSIS + portable ZIP + dmg + AppImage build, installed on both rigs — installer size and first-launch time recorded.
20. Delete `legacy/`; write `plans/SEQUENCING.md` and `plans/p0-foundation.md` — `rg "legacy/"` returns 0 hits outside git history.

### Automated tests added

Vitest over `packages/core` with `:memory:` SQLite per test (schema, ops, importers, normalise, FTS, round-trip). **The 100k fixture DB ships here** with weekly CI perf assertions (import < 60 s, p95 FTS < 150 ms). Playwright `_electron` smoke #1. i18n hardcoded-string lint. `core-purity` and `no-direct-update` guard tests.

### Human rig test — P0

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Notes |
|---|---|---|---|---|---|
| 1 | **COLD:** wipe `userData`, install the unsigned build, launch to an empty library | Window paints, zero console errors, no crash dialog | installer ___ MB · launch→interactive ___ s | installer ___ MB · launch→interactive ___ s | |
| 2 | Import the user's real Netscape export | Dedupe report shown before commit; committed count equals report | ___ links · ___ s · ___ dupes | ___ links · ___ s · ___ dupes | |
| 3 | Import live Chrome/Edge bookmarks | Profile auto-found, no manual path entry | ___ links · ___ s | ___ links · ___ s | |
| 4 | **SCALE:** open `fixtures/100k.db` | Table reports exactly 100,000 rows | open→first row ___ s · RSS ___ MB | open→first row ___ s · RSS ___ MB | |
| 5 | **SCALE:** scroll the 100k table continuously for 10 s | No blank rows, no scroll stall | ___ fps sustained · RSS after ___ MB | ___ fps sustained · RSS after ___ MB | |
| 6 | Search `café` then `cafe` over 100k | Both queries return the same hit set | p95 of 20 queries ___ ms | p95 of 20 queries ___ ms | |
| 7 | **FAILURE:** import a truncated / malformed Netscape file | Named bilingual error, transaction rolled back, app alive | rows committed ___ (must be 0) · recovery ___ s | rows committed ___ (must be 0) · recovery ___ s | |
| 8 | **FAILURE:** force-kill the app mid-import, relaunch | DB opens, WAL recovered, no partial rows | relaunch ___ s · row count ___ | relaunch ___ s · row count ___ | |
| 9 | Switch UI language FR ↔ EN on Library / Import / Settings | No untranslated or clipped string | untranslated strings ___ | untranslated strings ___ | |
| 10 | Export everything, re-import into a fresh `userData` | Row count and content hash equal | export ___ s · file ___ MB · row delta ___ | export ___ s · file ___ MB · row delta ___ | |

**Sign-off:** date ______ · tester ______ · **go / no-go** ______

**Numbers feed back into:** step 4–6 (100k open, scroll fps, FTS p95) confirm or break decision 8's "no ANN index needed at doc level" and set the P2 map frame budget; step 1 installer size sets the baseline the P4 local-AI-pack download must be measured against; step 5 RSS sets the memory ceiling P9's Loro doc must fit under.

### Exit criteria

- Unsigned installers built and installed on both rigs; app launches from a cold `userData`.
- Schema v1 migrated up and down; every mutation in the codebase routed through `applyOp`; `ops` rows written.
- All seven importers plus the CSV mapper land in one transaction with a pre-commit dedupe report.
- `fixtures/100k.db` committed (or generated by a committed seed) and the weekly perf job green.
- FR and EN complete on Library / Import / Settings; i18n lint in CI.
- `legacy/` deleted.

### What could go wrong

- **Native-module prebuild matrix** (better-sqlite3 across win-x64 / mac-arm64 / mac-x64 / linux-x64) eats days under electron-vite. *Fallback:* decision 14's reverse-if — collapse to one package with `src/core` and keep the import discipline as a lint rule.
- **The 100k fixture is unrealistic** (uniform domains, synthetic text) and flatters every later number. *Fallback:* seed the distributions from the user's real export before generating, and re-record P0 numbers once real text arrives in P3.
- **The op-log layer feels like ceremony** and gets bypassed "just this once" in an importer. *Fallback:* the `no-direct-update` grep test is CI-blocking, not advisory.
- **The Gemini key is already in git history.** *Fallback:* rotation is task 1 and non-negotiable; history rewriting is optional, rotation is not.
