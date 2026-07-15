import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { c as getProjectDetail } from './harness-reader_xurzrbMU.mjs';
import { p as parseActiveProjectId, g as getWorkspaceProject, a as activeProjectCookieHeader } from './workspace-manager_C2YuGzrP.mjs';

const GET = async ({ params, request }) => {
  const projectId = params.id;
  if (!projectId) {
    return jsonError("Project id is required", 400);
  }
  try {
    const activeId = parseActiveProjectId(request.headers.get("cookie"));
    const workspaceProject = await getWorkspaceProject(projectId, projectId);
    if (workspaceProject) {
      return jsonOk({
        id: workspaceProject.id,
        name: workspaceProject.name,
        description: workspaceProject.description,
        status: workspaceProject.status,
        initialized: workspaceProject.initialized,
        active: workspaceProject.id === (activeId ?? workspaceProject.id),
        path: workspaceProject.path,
        members: [],
        runtime_profile: {
          profile_id: workspaceProject.id,
          runtime: "cursor",
          baseline: "business",
          permissions: [],
          tools: [],
          limits: {}
        }
      });
    }
    const project = await getProjectDetail(projectId);
    if (!project) {
      return jsonError("Project not found", 404);
    }
    return jsonOk(project);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load project";
    return jsonError(message, 500);
  }
};
const POST = async ({ params, request }) => {
  const projectId = params.id;
  if (!projectId) {
    return jsonError("Project id is required", 400);
  }
  try {
    const activeId = parseActiveProjectId(request.headers.get("cookie"));
    const project = await getWorkspaceProject(projectId, projectId);
    if (!project) {
      return jsonError("Project not found", 404);
    }
    return new Response(JSON.stringify({ project, activated: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": activeProjectCookieHeader(projectId)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to activate project";
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
