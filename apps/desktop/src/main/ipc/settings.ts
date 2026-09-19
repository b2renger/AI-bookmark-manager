import { IPC, type Settings } from '../../shared/protocol.js';
import { readSettings, writeSettings } from '../settings.js';
import { asObject, handle } from './registry.js';

export function registerSettingsIpc(): void {
  handle<void, Settings>(IPC.SETTINGS_GET, () => readSettings());
  handle<Partial<Settings>, Settings>(IPC.SETTINGS_SET, (patch) => writeSettings(patch), {
    validate: (raw) => asObject(raw, 'settings:set') as Partial<Settings>,
  });
}
