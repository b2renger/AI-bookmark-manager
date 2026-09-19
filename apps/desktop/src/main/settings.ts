import { getUiSettings, patchUiSettings, systemClock } from '@cairn/core';
import type { Settings } from '../shared/protocol.js';
import { library } from './library.js';

// settings:get / settings:set (channel 32). Persisted in the `settings` table, not in a JSON file
// beside it: one store, one backup, one export. The two signatures below are the contract between
// protocol.ts's `Settings` and core's `UiSettings`: the return type proves one direction of
// assignability and the `patch` argument proves the other.

export function readSettings(): Settings {
  return getUiSettings(library().db);
}

export function writeSettings(patch: Partial<Settings>): Settings {
  return patchUiSettings(library().db, systemClock, patch);
}
