import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { getProjectDetail } from '../../../lib/harness-reader';
import {
  activeProjectCookieHeader,
  getWorkspaceProject,
  parseActiveProjectId,
} from '../../../lib/workspace-manager';

export const GET: APIRoute = async ({ params, request }) => {
  const projectId = params.id;

  if (!projectId) {
    return jsonError('Project id is required', 400);
  }

  try {
    const activeId = parseActiveProjectId(request.headers.get('cookie'));
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
          runtime: 'cursor',
          baseline: 'business',
          permissions: [],
          tools: [],
          limits: {},
        },
      });
    }

    const project = await getProjectDetail(projectId);

    if (!project) {
      return jsonError('Project not found', 404);
    }

    return jsonOk(project);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load project';
    return jsonError(message, 500);
  }
};

export const POST: APIRoute = async ({ params, request }) => {
  const projectId = params.id;

  if (!projectId) {
    return jsonError('Project id is required', 400);
  }

  try {
    const activeId = parseActiveProjectId(request.headers.get('cookie'));
    const project = await getWorkspaceProject(projectId, projectId);

    if (!project) {
      return jsonError('Project not found', 404);
    }

    return new Response(JSON.stringify({ project, activated: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': activeProjectCookieHeader(projectId),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to activate project';
    return jsonError(message, 500);
  }
};
