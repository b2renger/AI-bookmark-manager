> Part of the Cairn v2 plan. Read `plans/SEQUENCING.md` first, then this file, then the previous phase's rig-test record in `plans/rig-tests/`. Durations are working days for a solo developer. Decisions referenced as "decision N" live in `plans/research/03-the-pragmatic.md`.

# P9 — Loro and live sync

**Branch** `v2/p9-loro-sync` · **Duration** 18–28 days · **Depends on** P6 (identity, crypto, op log)

**Goal.** Replace the LWW merge *function* with Loro — one doc per collection, `LoroTree` for the hierarchy, SQLite demoted to a derived, rebuildable index — and add live sync over iroh with gossip catch-up.

**The one thing that must be true at the end.** Two people edit the same collection's tree simultaneously on two machines, one of them offline for an hour, and both end with the identical tree, with no lost edits and no cycles.

### Deliverables

- `packages/core/src/crdt/` — `docPerCollection`, `seedFromSqlite`, `project` (Loro event → one SQLite transaction), `rederive`.
- `packages/core/src/sync/` — `SyncTransport` interface, `irohTransport`, `trysteroTransport`, `mailbox` (NIP-44, v1.5 groundwork).
- `apps/desktop/src/main/syncProcess.ts`.
- `packages/ui/src/sync/` — `SyncStatus`, `ConflictInspector`, `InviteDialog` (+ QR).
- `tools/p2p-harness/` — N instances, separate `userData`, fake transport with partition / delay / drop / reorder.
- `packages/core/test/regressions/` — extended with CRDT seeds.

### Ordered tasks

1. Loro model: `collection:<uuid>` with `LoroMap meta`, `LoroMap items`, `LoroTree tree` — `crdtModel.test.ts` shape assertions.
2. Migration: seed a fresh Loro doc per collection from current SQLite state; SQLite becomes derived — `migrate.test.ts`: the projection of the seeded doc equals the source DB for the 100k fixture.
3. Projection layer: every Loro event applies in one SQLite transaction; a `rederive` command drops and rebuilds SQLite from the docs — `project.test.ts`: rederive equals live DB, including FTS and vectors.
4. Tree edits mapped to `LoroTree` move ops, preserving the P0 fractional indices — `tree.property.test.ts`: no cycles, no orphans, over random concurrent reparents.
5. `SyncTransport` interface plus the fake transport (partition / delay / drop / reorder) and the harness — 3 replicas run deterministically under a fixed seed.
6. **fast-check convergence suite:** random op sequences, random apply orders, 3 replicas, fixed seeds, failures written to `regressions/` — assert `toJSON()` equality and tree integrity.
7. iroh transport with ALPN `/bkm/loro/1` streaming Loro updates — one loopback smoke test plus a real two-machine test.
8. iroh-gossip per-collection topic so any online member relays catch-up — three-machine test (both rigs + a VM): A↔C online, B returns and syncs from C.
9. iroh-blobs for snapshot transfer, sharing BLAKE3 with the P3 snapshot store — `blobs.test.ts`: the same file has the same hash in both stores.
10. Encrypt every Loro update with `K_epoch` before it leaves the process — `syncCrypto.test.ts` plus a packet capture check showing no plaintext.
11. Periodic `export({mode:"shallow"})` to bound document growth — doc size after 50,000 ops recorded and asserted.
12. Invite: `cairn://join/<base58(collectionId ‖ epoch ‖ inviterNodeId ‖ relayHints ‖ expiry ‖ sig)>` registered by the installer, plus a QR rendering — manual: clicked from an email client on both rigs.
13. Sync status indicator — *directe / relayée / hors ligne / en retard* — manual on Wi-Fi and hotspot.
14. Offline catch-up: A does 50 ops offline, B does 50 ops offline, both reconnect → converge — harness plus one real two-rig run.
15. Conflict inspector showing fields whose value lost (audit only, not a merge UI) — manual.
16. Trystero (Nostr strategy) transport for a future browser peer, behind a flag — `trystero.test.ts` room-id hashing only; not shipped enabled.
17. Playwright smoke #10 — two app instances with separate `userData` edit the same collection and converge.

### Automated tests added

**CRDT convergence tests start here** (fast-check, 3 replicas, random partitions, fixed seeds, `regressions/` folder). The P2P harness with partition / delay / drop / reorder. Tree-integrity property tests. Smoke #10.

### Human rig test — P9

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Notes |
|---|---|---|---|---|---|
| 1 | **COLD:** fresh install, click a `cairn://join/...` invite from an email | App opens, shows "X invites you to *Collection* (N links)", joins on accept | click→joined ___ s · protocol handler y/n ___ | click→joined ___ s · protocol handler y/n ___ | |
| 2 | Migrate an existing 100k library to Loro docs | Projection equals the pre-migration DB; no data loss | migrate ___ min · row delta ___ (must be 0) · doc ___ MB | migrate ___ min · row delta ___ · doc ___ MB | |
| 3 | Edit a tree on both rigs simultaneously (drag + rename the same node) | Both converge to the same tree; nothing duplicated or orphaned | converge ___ s · divergent nodes ___ (must be 0) | converge ___ s · divergent nodes ___ | |
| 4 | **SCALE:** live-sync a 20,000-item collection | Memory bounded; sync completes | doc ___ MB · sync RSS ___ MB · full sync ___ s | doc ___ MB · sync RSS ___ MB · full sync ___ s | Sets the per-collection cap |
| 5 | **SCALE:** apply 50,000 ops then take a shallow snapshot | Doc growth bounded after the snapshot | before ___ MB · after ___ MB · snapshot ___ s | before ___ MB · after ___ MB · snapshot ___ s | |
| 6 | One rig offline for 1 h with 50 local edits, then reconnect | Catch-up import fast; all edits present on both sides | catch-up ___ s · edits preserved ___ /50 | catch-up ___ s · edits preserved ___ /50 | |
| 7 | Check the wire with a packet capture during sync | No plaintext bookmark titles or URLs observable | plaintext hits ___ (must be 0) | plaintext hits ___ | |
| 8 | **FAILURE:** one rig on a phone hotspot (symmetric NAT) | Falls back to relay; indicator says "relayée" | hole-punch success y/n ___ · connect ___ s · throughput ___ MB/s | hole-punch y/n ___ · connect ___ s · throughput ___ MB/s | |
| 9 | **FAILURE:** make the relay unreachable and both peers off-LAN | States "hors ligne", queues edits locally, no data loss on reconnect | queued ops ___ · loss on reconnect ___ (must be 0) | queued ops ___ · loss ___ | |
| 10 | **FAILURE:** delete the SQLite index and run `rederive` | Full index rebuilt from the Loro docs, search and map work again | rederive ___ min · row delta ___ (must be 0) | rederive ___ min · row delta ___ | |

**Sign-off:** date ______ · tester ______ · **go / no-go** ______

**Numbers feed back into:** step 4's doc size and RSS set the per-collection item cap surfaced in the UI ("split this collection"); step 8's hole-punch success rate decides whether the v1.5 mailbox node becomes mandatory rather than optional; step 2/10's migrate and rederive times set the acceptable maintenance window.

### Exit criteria

- Migration from SQLite state to Loro docs is lossless and reversible by `rederive`.
- Convergence property tests green across partitions and reorderings, with committed regression seeds.
- No plaintext on the wire; every update sealed under `K_epoch`.
- Offline catch-up preserves every edit on both sides in a real two-machine test.
- Sync status is always one of four honest states, never a spinner.

### What could go wrong

- **Loro's ~20 MB dependency and the projection layer double the debugging surface** (decision 3's stated cost). *Fallback:* the projection is one direction only and `rederive` exists; when a bug is ambiguous, drop SQLite and rebuild.
- **Symmetric NAT defeats hole punching for 5–15% of pairs** (Expert §4, risk #7). *Fallback:* relay; then the v1.5 mailbox node; the UI never claims "peer to peer", it claims "directe / relayée".
- **Doc growth is unbounded** for an active collection. *Fallback:* shallow snapshots on a schedule, plus the per-collection cap set by rig step 4 — never one doc for the whole library.
- **The migration loses a field** nobody notices for weeks. *Fallback:* rig step 2 asserts a zero row delta and a content-hash comparison, not an eyeball check; the pre-migration `library.db` is kept for 30 days.
