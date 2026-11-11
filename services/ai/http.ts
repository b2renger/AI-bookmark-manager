import { AiRateLimitError } from './types';

export interface HttpResult {
  ok: boolean;
  status: number;
  /** Parsed JSON body when there is one, otherwise null. */
  body: any;
  /** Raw text, for error messages. */
  text: string;
}

const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_WAIT_MS = 30_000;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST/GET JSON with a timeout, retrying on 429 and 503.
 *
 * After the retries are used up a rate limit is reported as an error. It is
 * never turned into a placeholder summary: a bookmark that says "summarised"
 * must have been summarised.
 */
export async function requestJson(
  url: string,
  init: RequestInit,
  opts: { timeoutMs?: number; providerLabel: string },
): Promise<HttpResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') {
        throw new Error(`${opts.providerLabel} did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
      }
      // A browser reports CORS refusals and unreachable hosts the same way.
      throw new Error(
        `Could not reach ${opts.providerLabel}. Check the connection, the endpoint URL, and that it allows requests from this site (CORS).`,
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

    if ((response.status === 429 || response.status === 503) && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, MAX_WAIT_MS)
        : Math.min(4000 * Math.pow(2.5, attempt), MAX_WAIT_MS);
      await delay(wait);
      continue;
    }

    if (response.status === 429) {
      throw new AiRateLimitError(
        `${opts.providerLabel} rate limit or quota reached. Wait a moment and press Retry, or switch model in Settings.`,
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
