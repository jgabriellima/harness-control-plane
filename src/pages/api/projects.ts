import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../lib/api-json';
import {
  activeProjectCookieHeader,
  createWorkspaceProject,
  listWorkspaceProjects,
  parseActiveProjectId,
} from '../../lib/workspace-manager';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const activeId = parseActiveProjectId(request.headers.get('cookie'));
    const projects = await listWorkspaceProjects(activeId ?? undefined);
    return jsonOk({ projects });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load projects';
    return jsonError(message, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  let body: unknown = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const name = isRecord(body) && typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length === 0) {
    return jsonError('name is required', 400);
  }

  try {
    const activeId = parseActiveProjectId(request.headers.get('cookie'));
    const project = await createWorkspaceProject({ name, activeId });
    return new Response(JSON.stringify({ project }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': activeProjectCookieHeader(project.id),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create project';
    const status = message.includes('already exists') ? 409 : 500;
    return jsonError(message, status);
  }
};
