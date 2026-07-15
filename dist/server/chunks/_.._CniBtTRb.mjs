import { r as resolveDesignDaemonConfig, d as designDaemonApiUrl } from './design-daemon-config_D0YSN28V.mjs';

const HOP_BY_HOP = /* @__PURE__ */ new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  // OD daemon rejects proxied browser Origin as cross-origin.
  "origin",
  "referer",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest"
]);
function buildUpstreamHeaders(request) {
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
const ALL = async ({ params, request }) => {
  const config = resolveDesignDaemonConfig();
  const segments = params.path;
  const pathSuffix = Array.isArray(segments) ? segments.join("/") : segments ?? "";
  const upstreamUrl = new URL(designDaemonApiUrl(`/api/${pathSuffix}`, config));
  upstreamUrl.search = new URL(request.url).search;
  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers: buildUpstreamHeaders(request),
      body: hasBody ? request.body : void 0,
      // @ts-expect-error duplex required for streaming bodies in Node fetch
      duplex: hasBody ? "half" : void 0,
      signal: AbortSignal.timeout(12e4)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Design daemon proxy failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
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
    headers: responseHeaders
  });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  ALL
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
