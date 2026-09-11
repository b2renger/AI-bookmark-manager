export async function proxyFetch(targetUrl: string, init?: RequestInit, proxyUrl?: string): Promise<Response> {
  const method = init?.method || 'GET';
  const headers = (init?.headers as Record<string, string>) || {};
  const body = init?.body;
  const chosenProxy = proxyUrl?.trim() || '/api/proxy';

  // If using our built-in proxy
  if (chosenProxy === '/api/proxy') {
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
  if (chosenProxy && chosenProxy !== 'none') {
    if (chosenProxy.includes('corsproxy.io') || chosenProxy.includes('cors-anywhere')) {
      requestUrl = `${chosenProxy}${encodeURIComponent(targetUrl)}`;
    } else {
      requestUrl = `${chosenProxy}${targetUrl}`;
    }
  }

  return fetch(requestUrl, init);
}
