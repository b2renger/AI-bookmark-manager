import type { CairnApi } from '../../shared/protocol';
import { useToastStore } from './toast';

// Every store call goes through here. Until the integration step wires the main-process
// handlers, `ipcRenderer.invoke` rejects with "No handler registered for …" — that must surface
// as a toast on the errors namespace, never as a white screen.

export function hasApi(): boolean {
  return typeof window !== 'undefined' && typeof window.cairn === 'object' && window.cairn !== null;
}

export function api(): CairnApi | null {
  return hasApi() ? window.cairn : null;
}

export function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return JSON.stringify(e);
}

/** True when the rejection is "the handler does not exist yet", not a real failure. */
export function isMissingHandler(e: unknown): boolean {
  return /no handler registered/i.test(describeError(e));
}

/**
 * Runs an IPC call and turns any failure into a toast keyed by `errorKey`.
 * Returns `null` on failure so callers can bail without try/catch noise.
 */
export async function call<T>(
  errorKey: string,
  fn: (cairn: CairnApi) => Promise<T>,
): Promise<T | null> {
  const cairn = api();
  if (!cairn) {
    useToastStore.getState().error('errors.ipcUnavailable');
    return null;
  }
  try {
    return await fn(cairn);
  } catch (e) {
    const detail = describeError(e);
    useToastStore.getState().error(isMissingHandler(e) ? 'errors.notWiredYet' : errorKey, detail);
    return null;
  }
}
