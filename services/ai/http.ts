import { AiBusyError, AiNetworkError, AiRateLimitError } from './types';

export interface HttpResult {
  ok: boolean;
  status: number;
  /** Parsed JSON body when there is one, otherwise null. */
  body: any;
  /** Raw text, for error messages. */
  text: string;
}

const MAX_RETRIES = 2;
const MAX_WAIT_MS = 30_000;
const NETWORK_RETRY_DELAYS_MS = [1500, 4000];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Shared back-off per service.
 *
 * Several links are processed at once, so when one request is told to slow
 * down, every other request to that service has to wait too. Otherwise the
 * others keep hitting the limit while the first one is waiting.
 */
const cooldownUntil = new Map<string, number>();
const rateLimitHits = new Map<string, number>();

async function waitForCooldown(label: string) {
  for (;;) {
    const wait = (cooldownUntil.get(label) ?? 0) - Date.now();
    if (wait <= 0) return;
    await delay(wait);
  }
}

function startCooldown(label: string, ms: number) {
  cooldownUntil.set(label, Math.max(cooldownUntil.get(label) ?? 0, Date.now() + ms));
}

/** How often a service asked us to slow down since the last reset. */
export function rateLimitCount(label: string): number {
  return rateLimitHits.get(label) ?? 0;
}

export function resetRateLimitCount(label: string): void {
  rateLimitHits.delete(label);
}

/**
 * POST/GET JSON with a timeout, retrying on rate limits and dropped connections.
 *
 * When the retries are used up the failure is reported as an error. It is
 * never turned into a placeholder summary: a bookmark that says "summarised"
 * must have been summarised.
 */
export async function requestJson(
  url: string,
  init: RequestInit,
  opts: { timeoutMs?: number; providerLabel: string },
): Promise<HttpResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const label = opts.providerLabel;
  let networkFailures = 0;

  for (let attempt = 0; ; attempt++) {
    await waitForCooldown(label);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') {
        throw new AiNetworkError(`${label} did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
      }
      // A dropped connection and an overloaded gateway look the same from a
      // browser, and both usually pass on a second try.
      if (networkFailures < NETWORK_RETRY_DELAYS_MS.length) {
        await delay(NETWORK_RETRY_DELAYS_MS[networkFailures++]);
        attempt--;
        continue;
      }
      throw new AiNetworkError(
        `Could not reach ${label} after several tries. If your connection is fine, the service may be overloaded, or (for a custom or local endpoint) it may not allow requests from this site.`,
      );
    }
    clearTimeout(timer);

    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }

    // Overload is about the model, not about this user's pace: waiting on it
    // would stall every other link. Report it at once so the caller can move
    // to another model, or come back to this link at the end of the import.
    if (response.status === 503) {
      throw new AiBusyError(`${label} is overloaded right now. ${errorMessageFrom({ ok: false, status: 503, body, text })}`);
    }

    if (response.status === 429) {
      rateLimitHits.set(label, (rateLimitHits.get(label) ?? 0) + 1);
      if (attempt < MAX_RETRIES) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, MAX_WAIT_MS)
          : Math.min(4000 * Math.pow(2.5, attempt), MAX_WAIT_MS);
        startCooldown(label, wait);
        continue;
      }
      throw new AiRateLimitError(
        `${label} rate limit or quota reached. Wait a moment and press Retry, or switch model in Settings.`,
      );
    }

    return { ok: response.ok, status: response.status, body, text };
  }
}

/** Best-effort extraction of a provider's error message. */
export function errorMessageFrom(result: HttpResult): string {
  const b = result.body;
  const msg =
    (typeof b?.error === 'string' && b.error) ||
    b?.error?.message ||
    b?.message ||
    (result.text && result.text.length < 300 ? result.text : '');
  return msg ? String(msg) : `HTTP ${result.status}`;
}
