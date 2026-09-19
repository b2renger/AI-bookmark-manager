import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { log } from '../logger.js';

// One wrapper around ipcMain.handle so every channel gets the same treatment: the payload shape is
// checked before the handler sees it, the handler's own throws are logged with the channel name,
// and what crosses back to the renderer is a stable `channel: message` string rather than an
// Electron stack trace with main-process paths in it.

export type Handler<Req, Res> = (request: Req, event: IpcMainInvokeEvent) => Res | Promise<Res>;

export interface HandleOptions<Req> {
  /** Throws with a human message when the payload is the wrong shape. */
  validate?: (raw: unknown) => Req;
}

export class IpcError extends Error {
  constructor(readonly channel: string, message: string) {
    super(`${channel}: ${message}`);
    this.name = 'IpcError';
  }
}

const registered = new Set<string>();

export function handle<Req, Res>(
  channel: string,
  fn: Handler<Req, Res>,
  opts: HandleOptions<Req> = {},
): void {
  if (registered.has(channel)) ipcMain.removeHandler(channel);
  registered.add(channel);

  ipcMain.handle(channel, async (event, raw: unknown): Promise<Res> => {
    const started = Date.now();
    try {
      const request = opts.validate ? opts.validate(raw) : (raw as Req);
      const result = await fn(request, event);
      log.debug('ipc ok', { channel, ms: Date.now() - started });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('ipc failed', { channel, ms: Date.now() - started, error: message });
      throw new IpcError(channel, message);
    }
  });
}

// ── the cheap validators ──────────────────────────────────────────────────────────────────
// Hand-written rather than Zod: main's bundle already carries core's schemas, and what arrives
// over IPC needs shape checks, not parsing. Anything deeper is validated where it is used
// (applyOpsFromDto refuses a non-shareable entity, normalizeUrl refuses a non-URL).

export function asObject(raw: unknown, what: string): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${what} must be an object`);
  }
  return raw as Record<string, unknown>;
}

export function asString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${what} must be a non-empty string`);
  return value;
}

export function asStringArray(value: unknown, what: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new Error(`${what} must be an array of strings`);
  }
  return value as string[];
}

export function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${what} must be an array`);
  return value;
}
