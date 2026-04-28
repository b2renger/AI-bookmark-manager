export async function proxyFetch(targetUrl: string, init?: RequestInit, proxyUrl?: string): Promise<Response> {
  const method = init?.method || 'GET';
  const headers = (init?.headers as Record<string, string>) || {};
  const body = init?.body;

  // If using our built-in proxy
  if (proxyUrl === '/api/proxy') {
    return fetch('/api/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: targetUrl,
        method,
        headers,
        body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      }),
    });
  }

  // If using a classic external CORS proxy that appends URLs
  let requestUrl = targetUrl;
  if (proxyUrl) {
    if (proxyUrl.includes('corsproxy.io') || proxyUrl.includes('cors-anywhere')) {
      requestUrl = `${proxyUrl}${encodeURIComponent(targetUrl)}`;
    } else {
      requestUrl = `${proxyUrl}${targetUrl}`;
    }
  }

  return fetch(requestUrl, init);
}
