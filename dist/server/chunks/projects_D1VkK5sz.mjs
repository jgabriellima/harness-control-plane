import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { p as parseActiveProjectId, l as listWorkspaceProjects, c as createWorkspaceProject, a as activeProjectCookieHeader } from './workspace-manager_C2YuGzrP.mjs';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
const GET = async ({ request }) => {
  try {
    const activeId = parseActiveProjectId(request.headers.get("cookie"));
    const projects = await listWorkspaceProjects(activeId ?? void 0);
    return jsonOk({ projects });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load projects";
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
  const name = isRecord(body) && typeof body.name === "string" ? body.name.trim() : "";
  if (name.length === 0) {
    return jsonError("name is required", 400);
  }
  try {
    const activeId = parseActiveProjectId(request.headers.get("cookie"));
    const project = await createWorkspaceProject({ name, activeId });
    return new Response(JSON.stringify({ project }), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": activeProjectCookieHeader(project.id)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create project";
    const status = message.includes("already exists") ? 409 : 500;
    return jsonError(message, status);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
