/**
 * Private CORS proxy for AI Bookmark Manager, as a Cloudflare Worker.
 *
 * Why it exists: the published app is a static site. Notion's API and the X
 * API refuse calls made directly from a browser, so those two features need a
 * small relay. This Worker is that relay, running on your own free Cloudflare
 * account, so your tokens never pass through someone else's proxy.
 *
 * It is deliberately not an open proxy:
 *  - only pages served from ALLOWED_ORIGINS may use it;
 *  - it only forwards to ALLOWED_HOSTS.
 *
 * Setup: see docs/SETUP.md ("Your own proxy"). In the app, set the proxy URL
 * to  https://<your-worker>.workers.dev/?
 */

// The site(s) allowed to use this proxy. Use the origin only: no path, no trailing slash.
const ALLOWED_ORIGINS = [
  'https://b2renger.github.io',
  'http://localhost:3000',
];

// The services this proxy may call.
const ALLOWED_HOSTS = [
  'api.notion.com',
  'api.x.com',
  'api.twitter.com',
  'cdn.syndication.twimg.com',
  'publish.twitter.com',
  'www.threads.net',
  'www.youtube.com',
  'noembed.com',
];

// Set to true to also let the app fetch article pages through this proxy
// (any https host). Leave false unless you want that.
const ALLOW_ANY_HOST = false;

// Request headers passed on to the target service.
const FORWARDED_HEADERS = ['authorization', 'content-type', 'accept', 'notion-version'];

function corsHeaders(origin, request) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      (request && request.headers.get('Access-Control-Request-Headers')) || FORWARDED_HEADERS.join(', '),
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function refuse(status, message, origin) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) Object.assign(headers, corsHeaders(origin));
  return new Response(JSON.stringify({ error: message, source: 'bookmark-proxy' }), { status, headers });
}

/** The target is everything after "/?", optionally written as "url=<encoded>". */
function readTarget(requestUrl) {
  const index = requestUrl.indexOf('/?');
  if (index === -1) return null;
  let raw = requestUrl.slice(index + 2);
  if (raw.startsWith('url=')) raw = decodeURIComponent(raw.slice(4));
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

async function handle(request) {
  const origin = request.headers.get('Origin');

  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return refuse(403, 'This proxy only accepts requests from its own app. Add your site to ALLOWED_ORIGINS.', null);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin, request) });
  }

  const target = readTarget(request.url);
  if (!target || target.protocol !== 'https:') {
    return refuse(400, 'Expected  https://<this-worker>/?https://service/path', origin);
  }
  if (!ALLOW_ANY_HOST && !ALLOWED_HOSTS.includes(target.hostname)) {
    return refuse(403, `Host not allowed: ${target.hostname}. Add it to ALLOWED_HOSTS.`, origin);
  }

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'follow',
    });
  } catch (err) {
    return refuse(502, `Could not reach ${target.hostname}.`, origin);
  }

  const responseHeaders = new Headers(corsHeaders(origin, request));
  const contentType = upstream.headers.get('Content-Type');
  if (contentType) responseHeaders.set('Content-Type', contentType);
  const retryAfter = upstream.headers.get('Retry-After');
  if (retryAfter) responseHeaders.set('Retry-After', retryAfter);
  responseHeaders.set('Access-Control-Expose-Headers', 'Retry-After');

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export default {
  fetch: handle,
};
