> Part of the Cairn v2 plan. Read `plans/SEQUENCING.md` first, then this file, then the previous phase's rig-test record in `plans/rig-tests/`. Durations are working days for a solo developer. Decisions referenced as "decision N" live in `plans/research/03-the-pragmatic.md`.

# P6 — identity and encrypted bundle sharing

**Branch** `v2/p6-sharing-bundles` · **Duration** 10–15 days · **Depends on** P0 (ops, `applyOp`), P1 (embeddings to ship inside the bundle), P3 (text to ship)

**Goal.** Ed25519 identity in `safeStorage`, per-collection epoch keys, the `.bkmshare` sealed bundle format, import-by-merge through the op log, and optional iroh direct transfer behind a flag.

**The one thing that must be true at the end.** Email a friend a `.bkmshare` of 40 links; they open it in a fresh install with no models and immediately get the links, the extracted text, the tags and working semantic search.

### Deliverables

- `packages/core/src/identity/` — Ed25519 master key, BIP39 24-word backup, X25519 derivation.
- `packages/core/src/crypto/` — XChaCha20-Poly1305 sealing, `K_epoch`, per-member wrapping, rotation.
- `packages/core/src/bundle/` — streaming writer and reader (JSONL records + manifest + BLAKE3-addressed blobs).
- `packages/core/src/merge/` — op-log LWW merge (the function Loro replaces in P9).
- `apps/desktop/src/main/safeStorageKeys.ts`; `apps/desktop/src/main/irohTransfer.ts` (feature-flagged).
- `packages/ui/src/share/` — `ShareDialog`, `ReceiveDialog`, `MembersPanel`, `P2PDisclosure`.
- `docs/bundle-format.md`, `packages/core/test/regressions/` (fast-check seeds).

### Ordered tasks

1. Ed25519 identity generated on first run; private key stored via Electron `safeStorage` — `identity.test.ts`; manual: the key is not readable as plaintext in `userData`.
2. BIP39 24-word backup and restore flow, FR/EN — manual: restoring on the other rig reproduces the same public key.
3. X25519 derivation via `@noble/curves` for key agreement — `kex.test.ts` against known-answer vectors.
4. Per-collection `K_epoch` (32 random bytes) wrapped to each member's X25519 key; rotation on removal — `epoch.test.ts`: a removed member cannot open epoch n+1, and the UI states plainly that removal prevents future changes only.
5. Migrate the P4 API keys and any per-collection keys into `safeStorage` — `keys.test.ts`: no key material in any settings JSON.
6. `.bkmshare` writer: JSONL records + extracted text + 768-d embeddings + optional snapshots, sealed XChaCha20-Poly1305, signed Ed25519, fully streamed — a 5,000-link bundle writes in < 20 s with bounded memory.
7. Reader verifying the signature *before* writing anything — `bundle.test.ts`: a single flipped byte is rejected and zero rows are committed.
8. Import-by-merge through `applyOp`, never overwrite — `merge.test.ts`: importing the same bundle twice is a no-op; a locally edited title survives a re-import with an older HLC.
9. **fast-check property tests on the op-log merge** — random op sequences across 3 actors, random apply orders, assert convergence and no field loss; failing seeds recorded in `regressions/` — `merge.property.test.ts`.
10. Members panel with roles (owner / writer / reader) and the current epoch — manual.
11. Re-export / subscription flow: publisher re-exports, receiver merges, receiver's local edits survive — manual two-rig test with a deliberate concurrent edit.
12. iroh direct transfer behind a feature flag (`@number0/iroh`), with a connection indicator reading *directe / relayée / hors ligne* — manual on Wi-Fi and on a phone hotspot.
13. P2P disclosure modal shown once before the first direct share, in plain FR/EN, exactly as decision 15 words it — manual in both locales.
14. `egress_log` rows for every peer transfer, with byte counts — `egress.test.ts`.
15. Snapshot inclusion requires an explicit confirmation naming the size — manual at a 1.2 GB bundle.
16. Default domain exclusion list applied to share as well as fetch: excluded-domain items are never placed in a bundle — `exclusions.test.ts`.
17. Playwright smoke #7 — export a bundle → fresh `userData` → import → row count and search both correct.

### Automated tests added

**fast-check property tests on the op-log merge start here**, with a `regressions/` seed folder. Bundle tamper-rejection tests. Epoch rotation tests. Smoke #7.

### Human rig test — P6

| # | Step | Pass criterion | Windows 3050 (measure) | macOS M1 (measure) | Notes |
|---|---|---|---|---|---|
| 1 | **COLD:** fresh `userData`, no models — receive and open a 40-link `.bkmshare` | Links, text, tags and semantic search all work with no model download | import ___ s · search p95 ___ ms | import ___ s · search p95 ___ ms | The friend experience |
| 2 | Create an identity, back it up with the 24 words, restore on the other rig | Same public key on both machines | backup ___ s · restore ___ s · key match y/n ___ | backup ___ s · restore ___ s · key match y/n ___ | |
| 3 | Share a 500-link collection with snapshots off | Bundle written streamed, size warning accurate | bundle ___ MB · write ___ s · peak RSS ___ MB | bundle ___ MB · write ___ s · peak RSS ___ MB | |
| 4 | **SCALE:** bundle 20,000 links from `fixtures/100k.db` | Memory stays bounded; no OOM | bundle ___ MB · write ___ s · read ___ s · peak RSS ___ MB | bundle ___ MB · write ___ s · read ___ s · peak RSS ___ MB | Sizes v1.5 mailbox |
| 5 | Both rigs edit the same received collection, then re-export / re-merge | Both edits survive; no silent overwrite | conflicts ___ · lost edits ___ (must be 0) | conflicts ___ · lost edits ___ | Gates decision 2 |
| 6 | Remove a member, rotate the epoch, re-share | Removed member cannot open the new bundle | rotate ___ s · re-wrap members ___ | rotate ___ s · re-wrap members ___ | |
| 7 | Direct transfer over iroh on the same Wi-Fi | Indicator reads "directe"; transfer completes | ___ MB/s · connect ___ s · path ___ | ___ MB/s · connect ___ s · path ___ | |
| 8 | **FAILURE:** repeat step 7 with one rig on a phone hotspot (symmetric NAT) | Falls back to relay or states "hors ligne" clearly; never hangs | connect ___ s · path ___ · throughput ___ MB/s | connect ___ s · path ___ · throughput ___ MB/s | |
| 9 | **FAILURE:** flip one byte in a `.bkmshare`, import it | Rejected before any write; named bilingual error | rows committed ___ (must be 0) · detect ___ s | rows committed ___ · detect ___ s | |
| 10 | **FAILURE:** import a bundle sealed to a different key | Clear "not addressed to you" message, no crash, no partial state | message correct y/n ___ | message correct y/n ___ | |

**Sign-off:** date ______ · tester ______ · **go / no-go** ______

**Numbers feed back into:** step 4's MB-per-link sets the v1.5 mailbox node sizing and the snapshot-inclusion warning threshold; step 5's lost-edit count is the direct trigger for decision 2's reverse-if (pull Loro forward a phase); step 7/8's connect path decides whether iroh direct transfer ships enabled or stays flagged off in v1.

### Exit criteria

- Identity generated, stored in `safeStorage`, backed up and restored across machines.
- Bundles stream, verify signatures before writing, and merge idempotently through `applyOp`.
- fast-check merge properties green with a committed `regressions/` folder.
- Epoch rotation locks out a removed member for future epochs, and the UI says exactly that.
- P2P disclosure shown once before the first direct share, in both locales.

### What could go wrong

- **Loro has no permissions or crypto, and neither does this hand-rolled layer** (Expert risk #6). *Fallback:* `@noble` primitives only, encrypt before anything leaves the process, property-test epoch rotation; no MLS attempt in 2026.
- **The op-log LWW merge grows past ~300 lines or needs per-type rules.** *Fallback:* decision 3's reverse-if — that is Loro asking to be adopted early; pull P9 forward rather than reimplementing it badly.
- **No `@number0/iroh` darwin-x64 prebuild**, so an Intel Mac friend cannot direct-transfer. *Fallback:* decision 13 already accepts this — bundles by file are the v1 path, and the feature flag stays off on x64.
- **A friend cannot open the bundle** because the mail provider rewrites or blocks the attachment. *Fallback:* the format is one file with no external dependencies; document WeTransfer / USB / Signal explicitly in `docs/`.
