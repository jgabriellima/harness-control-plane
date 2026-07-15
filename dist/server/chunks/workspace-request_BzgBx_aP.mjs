import { e as ensureWorkspacesReady, n as normalizeWorkspaceId, p as parseActiveProjectId, r as resolveProjectWorkspaceRoot, l as listWorkspaceProjects, d as resolveActiveWorkspaceRoot } from './workspace-manager_C2YuGzrP.mjs';
import { D as DEFAULT_WORKSPACE_ID } from './workspace-constants_DFgBwlV3.mjs';

async function resolveRequestWorkspace(request, projectId) {
  await ensureWorkspacesReady();
  const cookieActiveId = normalizeWorkspaceId(parseActiveProjectId(request.headers.get("cookie")));
  if (projectId?.trim()) {
    const trimmed = normalizeWorkspaceId(projectId.trim()) ?? projectId.trim();
    return {
      workspaceRoot: resolveProjectWorkspaceRoot(trimmed),
      activeProjectId: trimmed
    };
  }
  const cookieProjectId = cookieActiveId ?? void 0;
  if (!cookieProjectId) {
    const workspaceProjects = await listWorkspaceProjects(void 0);
    const activeWorkspace = workspaceProjects.find((project) => project.active) ?? workspaceProjects.find((project) => project.id === DEFAULT_WORKSPACE_ID) ?? workspaceProjects[0];
    if (activeWorkspace) {
      return {
        workspaceRoot: activeWorkspace.path ?? resolveProjectWorkspaceRoot(activeWorkspace.id),
        activeProjectId: activeWorkspace.id
      };
    }
  }
  const workspaceRoot = await resolveActiveWorkspaceRoot(cookieProjectId);
  const projects = await listWorkspaceProjects(cookieProjectId);
  const active = projects.find((project) => project.id === cookieProjectId) ?? projects.find((project) => project.active) ?? projects.find((project) => project.id === DEFAULT_WORKSPACE_ID) ?? projects[0];
  return {
    workspaceRoot,
    activeProjectId: cookieProjectId ?? active?.id ?? DEFAULT_WORKSPACE_ID
  };
}

export { resolveRequestWorkspace as r };
