import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { f as closeBrowserSession, g as getBrowserSession, h as getBrowserSessionForConversation, i as createBrowserSession } from './runtime-browser-bridge_DsG8qbJ7.mjs';
import { b as broadcastBrowserSessionReady } from './runtime-hub-stream_CkfCSBM_.mjs';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
const GET = async ({ url }) => {
  const sessionId = url.searchParams.get("session_id")?.trim();
  const conversationId = url.searchParams.get("conversation_id")?.trim();
  if (sessionId) {
    const session = getBrowserSession(sessionId);
    if (!session) {
      return jsonError("Browser session not found", 404);
    }
    return jsonOk({ session });
  }
  if (conversationId) {
    const session = getBrowserSessionForConversation(conversationId);
    if (!session) {
      return jsonOk({ session: null });
    }
    return jsonOk({ session });
  }
  return jsonError("session_id or conversation_id query parameter is required", 400);
};
const POST = async ({ request }) => {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const urlRaw = isRecord(body) && typeof body.url === "string" ? body.url : "";
  const conversationId = isRecord(body) && typeof body.conversation_id === "string" ? body.conversation_id : void 0;
  const interactive = isRecord(body) && body.interactive === true;
  if (!urlRaw.trim()) {
    return jsonError("url is required", 400);
  }
  try {
    const { session, created } = await createBrowserSession({
      url: urlRaw,
      conversationId,
      interactive
    });
    if (!interactive && created) {
      broadcastBrowserSessionReady({
        conversationId: session.conversationId,
        sessionId: session.sessionId,
        url: session.url,
        interactive: false,
        controlMode: session.controlMode,
        viewportWidth: session.viewportWidth,
        viewportHeight: session.viewportHeight,
        renderMode: session.renderMode
      });
    }
    return jsonOk({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create browser session";
    return jsonError(message, 500);
  }
};
const DELETE = async ({ url }) => {
  const sessionId = url.searchParams.get("session_id")?.trim();
  if (!sessionId) {
    return jsonError("session_id query parameter is required", 400);
  }
  const closed = await closeBrowserSession(sessionId);
  if (!closed) {
    return jsonError("Browser session not found", 404);
  }
  return jsonOk({ closed: true, sessionId });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  DELETE,
  GET,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
