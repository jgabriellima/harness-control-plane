import { b as listProfileConversations, c as createConversation } from './runtime-orchestrator_CdeKZAGP.mjs';
import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { a as activeProjectCookieHeader } from './workspace-manager_C2YuGzrP.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
const GET = async ({ url, request }) => {
  try {
    const projectId = url.searchParams.get("project_id")?.trim() || void 0;
    const includeArchived = url.searchParams.get("include_archived") === "true";
    const { workspaceRoot, activeProjectId } = await resolveRequestWorkspace(request, projectId);
    const filterProjectId = projectId ?? activeProjectId;
    const conversations = await listProfileConversations(workspaceRoot, filterProjectId, {
      includeArchived
    });
    return jsonOk({ conversations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load conversations";
    return jsonError(message, 500);
  }
};
const POST = async ({ request }) => {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const title = isRecord(body) && typeof body.title === "string" ? body.title : void 0;
  const projectId = isRecord(body) && typeof body.project_id === "string" ? body.project_id : void 0;
  try {
    const { workspaceRoot, activeProjectId } = await resolveRequestWorkspace(request, projectId);
    const resolvedProjectId = projectId ?? activeProjectId;
    const conversation = await createConversation(workspaceRoot, {
      title,
      projectId: resolvedProjectId
    });
    return new Response(JSON.stringify({ conversation }), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": activeProjectCookieHeader(resolvedProjectId)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create conversation";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
