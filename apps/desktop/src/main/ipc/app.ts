import { app } from 'electron';
import { IPC, type AppInfo } from '../../shared/protocol.js';
import { libraryPath } from '../library.js';
import { handle } from './registry.js';

// Channel 1. `dbPath` is the real file the library is open on — 00-boot.spec.ts asserts it, and
// docs/recovery.md tells the user to open exactly that path with plain sqlite3.

export function registerAppIpc(isDev: boolean): void {
  handle<void, AppInfo>(IPC.APP_INFO, () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    userDataPath: app.getPath('userData'),
    dbPath: libraryPath(app.getPath('userData')),
    locale: app.getLocale(),
    dev: isDev,
  }));
}
