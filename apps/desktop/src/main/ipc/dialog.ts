import { BrowserWindow, dialog, shell } from 'electron';
import { readFileSync, statSync } from 'node:fs';
import { IPC, type OpenFileRequest, type OpenFileResult } from '../../shared/protocol.js';
import { log } from '../logger.js';
import { asObject, handle } from './registry.js';

// The three host-service channels. Each one is a place where the renderer asks main to do
// something it is deliberately not allowed to do itself: touch the filesystem, or hand a URL to
// the OS.

/** Above this, the renderer gets the path and main reads the file during import:preview instead.
 *  A 200 MB Pocket export must not be copied through the structured clone. */
export const MAX_INLINE_BYTES = 50 * 1024 * 1024;

export function registerDialogIpc(): void {
  handle<OpenFileRequest, OpenFileResult | null>(
    IPC.DIALOG_OPEN_FILE,
    async (request) => {
      const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const options = {
        properties: ['openFile'] as ['openFile'],
        ...(request.filters === undefined ? {} : { filters: request.filters }),
      };
      const picked = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      const path = picked.canceled ? undefined : picked.filePaths[0];
      if (path === undefined) return null;

      if (request.withBytes !== true) return { path };
      try {
        if (statSync(path).size > MAX_INLINE_BYTES) {
          log.info('dialog: file too large to inline, returning the path only', { path });
          return { path };
        }
        return { path, bytes: new Uint8Array(readFileSync(path)) };
      } catch (err) {
        log.warn('dialog: could not read the picked file', { path, err: String(err) });
        return { path };
      }
    },
    { validate: (raw) => (raw === undefined ? {} : (asObject(raw, 'dialog:openFile') as OpenFileRequest)) },
  );

  handle<void, string | null>(IPC.DIALOG_OPEN_DIR, async () => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const options = { properties: ['openDirectory', 'createDirectory'] as ['openDirectory', 'createDirectory'] };
    const picked = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    return picked.canceled ? null : (picked.filePaths[0] ?? null);
  });

  // Only http(s) ever reaches the OS: `file:`, `javascript:` and custom schemes are refused here,
  // not in the renderer, because the renderer is the untrusted side (docs/SECURITY.md).
  handle<string, boolean>(
    IPC.SHELL_OPEN_EXTERNAL,
    async (url) => {
      if (!/^https?:\/\//i.test(url)) {
        log.warn('shell: refused a non-http(s) target', { url: url.slice(0, 80) });
        return false;
      }
      await shell.openExternal(url);
      return true;
    },
    {
      validate: (raw) => {
        if (typeof raw !== 'string') throw new Error('shell:openExternal expects a url string');
        return raw;
      },
    },
  );
}
