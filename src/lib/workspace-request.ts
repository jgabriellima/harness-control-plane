import {
  parseActiveProjectId,
  resolveActiveWorkspaceRoot,
  resolveProjectWorkspaceRoot,
} from './workspace-manager';

export async function resolveRequestWorkspace(
  request: Request,
  projectId?: string | null,
): Promise<{ workspaceRoot: string; activeProjectId: string }> {
  const cookieActiveId = parseActiveProjectId(request.headers.get('cookie'));

  if (projectId?.trim()) {
    const trimmed = projectId.trim();
    return {
      workspaceRoot: resolveProjectWorkspaceRoot(trimmed),
      activeProjectId: trimmed,
    };
  }

  const activeProjectId = cookieActiveId ?? undefined;
  const workspaceRoot = await resolveActiveWorkspaceRoot(activeProjectId);

  const projects = await import('./workspace-manager').then((mod) =>
    mod.listWorkspaceProjects(activeProjectId),
  );
  const active = projects.find((project) => project.active) ?? projects[0];

  return {
    workspaceRoot,
    activeProjectId: active?.id ?? activeProjectId ?? 'default',
  };
}
