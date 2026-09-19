import { createHlc, systemClock, webRandom, type DbHandle, type OpContext } from '@cairn/core';

// The host's OpContext (§3.7). `actorPubkey` is '' until an identity exists (P6); ops/hlc.ts
// derives a stable actor short id from it, so the HLC is well-formed from the first launch and the
// op log does not need rewriting when the key arrives.

export function createOpContext(db: DbHandle, actorPubkey = ''): OpContext {
  return {
    db,
    clock: systemClock,
    random: webRandom,
    actorPubkey,
    hlc: createHlc(systemClock, actorPubkey),
    origin: 'local',
  };
}
