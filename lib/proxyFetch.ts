/** The local development server's proxy route (see server.ts). */
export const LOCAL_PROXY = '/api/proxy';

/**
 * Fetches a URL, optionally through a CORS proxy.
 *
 * The published site is static, so there is no proxy by default: an empty
 * `proxyUrl` means a direct browser request, which only succeeds for
 * endpoints that allow cross-origin calls.
 */
export async function proxyFetch(targetUrl: string, init?: RequestInit, proxyUrl?: string): Promise<Response> {
  const chosenProxy = (proxyUrl ?? '').trim();

  if (!chosenProxy || chosenProxy === 'none') {
    return fetch(targetUrl, init);
  }

  // The dev server's proxy takes the request description as JSON.
  if (chosenProxy === LOCAL_PROXY) {
    const method = init?.method || 'GET';
    const headers = (init?.headers as Record<string, string>) || {};
    const body = init?.body;
    return fetch(LOCAL_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: init?.signal,
      body: JSON.stringify({
        url: targetUrl,
        method,
        headers,
        body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      }),
    });
  }

  // A prefix-style proxy: the target URL is appended as-is (see proxy/cloudflare-worker.js).
  const requestUrl = `${chosenProxy}${targetUrl}`;
  return fetch(requestUrl, init);
}
