import { j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { g as getBrowserSession, j as subscribeBrowserScreencast, k as subscribeBrowserUrl } from './runtime-browser-bridge_DsG8qbJ7.mjs';

function encodeSseFrame(frameBase64) {
  const encoder = new TextEncoder();
  return encoder.encode(`data: ${JSON.stringify({ type: "frame", frame: frameBase64 })}

`);
}
function encodeSseUrl(url) {
  const encoder = new TextEncoder();
  return encoder.encode(`data: ${JSON.stringify({ type: "url", url })}

`);
}
function encodeSseHeartbeat() {
  const encoder = new TextEncoder();
  return encoder.encode(": heartbeat\n\n");
}
const GET = async ({ url, request }) => {
  const sessionId = url.searchParams.get("session_id")?.trim();
  if (!sessionId) {
    return jsonError("session_id query parameter is required", 400);
  }
  const session = getBrowserSession(sessionId);
  if (!session) {
    return jsonError("Browser session not found", 404);
  }
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let heartbeat;
      let unsubscribe = null;
      let unsubscribeUrl = null;
      function closeStream() {
        if (closed) {
          return;
        }
        closed = true;
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = void 0;
        }
        unsubscribe?.();
        unsubscribe = null;
        unsubscribeUrl?.();
        unsubscribeUrl = null;
        try {
          controller.close();
        } catch {
        }
      }
      function safeEnqueue(chunk) {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(chunk);
        } catch {
          closeStream();
        }
      }
      heartbeat = setInterval(() => {
        safeEnqueue(encodeSseHeartbeat());
      }, 15e3);
      unsubscribe = subscribeBrowserScreencast(sessionId, (frame) => {
        safeEnqueue(encodeSseFrame(frame));
      });
      unsubscribeUrl = subscribeBrowserUrl(sessionId, (url2) => {
        safeEnqueue(encodeSseUrl(url2));
      });
      if (!unsubscribe) {
        closeStream();
        return;
      }
      request.signal.addEventListener("abort", closeStream, { once: true });
    },
    cancel() {
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
