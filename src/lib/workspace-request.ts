import {
  DEFAULT_WORKSPACE_ID,
  ensureWorkspacesReady,
  listWorkspaceProjects,
  normalizeWorkspaceId,
  parseActiveProjectId,
  resolveActiveWorkspaceRoot,
  resolveProjectWorkspaceRoot,
} from './workspace-manager';

export async function resolveRequestWorkspace(
  request: Request,
  projectId?: string | null,
): Promise<{ workspaceRoot: string; activeProjectId: string }> {
  await ensureWorkspacesReady();

  const cookieActiveId = normalizeWorkspaceId(parseActiveProjectId(request.headers.get('cookie')));

  if (projectId?.trim()) {
    const trimmed = normalizeWorkspaceId(projectId.trim()) ?? projectId.trim();
    return {
      workspaceRoot: resolveProjectWorkspaceRoot(trimmed),
      activeProjectId: trimmed,
    };
  }

  const cookieProjectId = cookieActiveId ?? undefined;

  if (!cookieProjectId) {
    const workspaceProjects = await listWorkspaceProjects(undefined);
    const activeWorkspace =
      workspaceProjects.find((project) => project.active) ??
      workspaceProjects.find((project) => project.id === DEFAULT_WORKSPACE_ID) ??
      workspaceProjects[0];
    if (activeWorkspace) {
      return {
        workspaceRoot: activeWorkspace.path ?? resolveProjectWorkspaceRoot(activeWorkspace.id),
        activeProjectId: activeWorkspace.id,
      };
    }
  }

  const workspaceRoot = await resolveActiveWorkspaceRoot(cookieProjectId);
  const projects = await listWorkspaceProjects(cookieProjectId);
  const active =
    projects.find((project) => project.id === cookieProjectId) ??
    projects.find((project) => project.active) ??
    projects.find((project) => project.id === DEFAULT_WORKSPACE_ID) ??
    projects[0];

  return {
    workspaceRoot,
    activeProjectId: cookieProjectId ?? active?.id ?? DEFAULT_WORKSPACE_ID,
  };
}
