import type { APIRoute } from 'astro';

import { designDaemonApiUrl, resolveDesignDaemonConfig } from '../../../lib/design-daemon-config';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  // OD daemon rejects proxied browser Origin as cross-origin.
  'origin',
  'referer',
  'sec-fetch-site',
  'sec-fetch-mode',
  'sec-fetch-dest',
]);

function buildUpstreamHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) {
      continue;
    }
    headers.set(key, value);
  }
  return headers;
}

export const ALL: APIRoute = async ({ params, request }) => {
  const config = resolveDesignDaemonConfig();
  const segments = params.path;
  const pathSuffix = Array.isArray(segments) ? segments.join('/') : segments ?? '';
  const upstreamUrl = new URL(designDaemonApiUrl(`/api/${pathSuffix}`, config));
  upstreamUrl.search = new URL(request.url).search;

  const method = request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers: buildUpstreamHeaders(request),
      body: hasBody ? request.body : undefined,
      // @ts-expect-error duplex required for streaming bodies in Node fetch
      duplex: hasBody ? 'half' : undefined,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Design daemon proxy failed';
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const responseHeaders = new Headers();
  for (const [key, value] of upstreamResponse.headers.entries()) {
    if (HOP_BY_HOP.has(key.toLowerCase())) {
      continue;
    }
    responseHeaders.set(key, value);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
};
