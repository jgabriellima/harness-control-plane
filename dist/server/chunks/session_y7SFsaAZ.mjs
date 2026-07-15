import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { c as closeComputerUsePreviewSession, g as getComputerUsePreviewSession, d as refreshSandboxPreviewSession, e as getComputerUsePreviewSessionForConversation, f as createComputerUsePreviewSession } from './runtime-computer-use-panel-bridge_BjPU812J.mjs';
import { l as loadComputerUseSession } from './runtime-computer-use-sessions_B-gZt_T7.mjs';
import { p as parseComputerUseTargetMode } from './runtime-computer-use-types_BWl7pttb.mjs';
import { g as broadcastComputerUsePreviewReady } from './runtime-hub-stream_CkfCSBM_.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
const GET = async ({ url }) => {
  const sessionId = url.searchParams.get("session_id")?.trim();
  const conversationId = url.searchParams.get("conversation_id")?.trim();
  if (sessionId) {
    let session = getComputerUsePreviewSession(sessionId);
    if (session?.streamKind === "sandbox_vnc" && session.status !== "ready") {
      session = await refreshSandboxPreviewSession(sessionId) ?? session;
    }
    if (!session) {
      return jsonError("Computer-use preview session not found", 404);
    }
    return jsonOk({ session });
  }
  if (conversationId) {
    const session = getComputerUsePreviewSessionForConversation(conversationId);
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
  const conversationId = isRecord(body) && typeof body.conversation_id === "string" ? body.conversation_id : void 0;
  let targetMode = isRecord(body) ? parseComputerUseTargetMode(body.target_mode) : null;
  try {
    const forceRestart = isRecord(body) && body.force_restart === true;
    if (!targetMode && conversationId) {
      const projectId2 = isRecord(body) && typeof body.project_id === "string" ? body.project_id : void 0;
      const { workspaceRoot: workspaceRoot2 } = await resolveRequestWorkspace(request, projectId2);
      const chatSession = await loadComputerUseSession(conversationId, workspaceRoot2);
      targetMode = chatSession.mode ?? "host";
    }
    const projectId = isRecord(body) && typeof body.project_id === "string" ? body.project_id : void 0;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const session = await createComputerUsePreviewSession({
      conversationId,
      projectId: projectId ?? "default",
      targetMode: targetMode ?? "host",
      forceRestart,
      workspaceRoot
    });
    broadcastComputerUsePreviewReady({
      conversationId: session.conversationId,
      sessionId: session.sessionId
    });
    return jsonOk({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create computer-use preview session";
    return jsonError(message, 500);
  }
};
const DELETE = async ({ url }) => {
  const sessionId = url.searchParams.get("session_id")?.trim();
  if (!sessionId) {
    return jsonError("session_id query parameter is required", 400);
  }
  const closed = await closeComputerUsePreviewSession(sessionId);
  if (!closed) {
    return jsonError("Computer-use preview session not found", 404);
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
