import { d as deleteConversation, a as getConversationById, l as loadConversationTranscript, u as updateConversationAgent, p as patchConversation } from './runtime-orchestrator_CdeKZAGP.mjs';
import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
const GET = async ({ params, request, url }) => {
  const conversationId = params.id;
  if (!conversationId) {
    return jsonError("Conversation id is required", 400);
  }
  try {
    const projectId = url.searchParams.get("project_id")?.trim() || void 0;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const conversation = await getConversationById(workspaceRoot, conversationId);
    if (!conversation) {
      return jsonError("Conversation not found", 404);
    }
    const messages = await loadConversationTranscript(workspaceRoot, conversationId);
    return jsonOk({
      id: conversation.id,
      title: conversation.title,
      projectId: conversation.projectId,
      updatedAt: conversation.updatedAt,
      agentId: conversation.agentId ?? null,
      archived: conversation.archived ?? false,
      messages
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load conversation";
    return jsonError(message, 500);
  }
};
const PATCH = async ({ params, request, url }) => {
  const conversationId = params.id;
  if (!conversationId) {
    return jsonError("Conversation id is required", 400);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON", 400);
  }
  if (!isRecord(body)) {
    return jsonError("Request body must be a JSON object", 400);
  }
  try {
    const projectId = url.searchParams.get("project_id")?.trim() || void 0;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    if (typeof body.agent_id === "string") {
      const conversation = await updateConversationAgent(
        workspaceRoot,
        conversationId,
        body.agent_id
      );
      if (!conversation) {
        return jsonError("Conversation not found", 404);
      }
      return jsonOk({ conversation });
    }
    if (Array.isArray(body.messages)) {
      return jsonError(
        "Transcript PATCH is deprecated — messages are sourced from vendor storage via session registry",
        410
      );
    }
    const title = typeof body.title === "string" ? body.title : void 0;
    const archived = typeof body.archived === "boolean" ? body.archived : void 0;
    const moveProjectId = typeof body.project_id === "string" ? body.project_id.trim() : void 0;
    if (title !== void 0 || archived !== void 0 || moveProjectId) {
      const conversation = await patchConversation(workspaceRoot, conversationId, {
        title,
        archived,
        projectId: moveProjectId
      });
      if (!conversation) {
        return jsonError("Conversation not found", 404);
      }
      return jsonOk({ conversation });
    }
    return jsonError("No supported patch fields provided", 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update conversation";
    return jsonError(message, 500);
  }
};
const DELETE = async ({ params, request, url }) => {
  const conversationId = params.id;
  if (!conversationId) {
    return jsonError("Conversation id is required", 400);
  }
  try {
    const projectId = url.searchParams.get("project_id")?.trim() || void 0;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const deleted = await deleteConversation(workspaceRoot, conversationId);
    if (!deleted) {
      return jsonError("Conversation not found", 404);
    }
    return jsonOk({ deleted: true, id: conversationId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete conversation";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  DELETE,
  GET,
  PATCH
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
