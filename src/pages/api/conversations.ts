import type { APIRoute } from 'astro';

import { createConversation, listProfileConversations } from '../../lib/conversation-store';
import { jsonError, jsonOk } from '../../lib/api-json';
import { resolveRequestWorkspace } from '../../lib/workspace-request';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const GET: APIRoute = async ({ url, request }) => {
  try {
    const projectId = url.searchParams.get('project_id')?.trim() || undefined;
    const includeArchived = url.searchParams.get('include_archived') === 'true';
    const { workspaceRoot, activeProjectId } = await resolveRequestWorkspace(request, projectId);
    const filterProjectId = projectId ?? activeProjectId;
    const conversations = await listProfileConversations(workspaceRoot, filterProjectId, {
      includeArchived,
    });
    return jsonOk({ conversations });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load conversations';
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

  const title = isRecord(body) && typeof body.title === 'string' ? body.title : undefined;
  const projectId =
    isRecord(body) && typeof body.project_id === 'string' ? body.project_id : undefined;

  try {
    const { workspaceRoot, activeProjectId } = await resolveRequestWorkspace(request, projectId);
    const conversation = await createConversation(workspaceRoot, {
      title,
      projectId: projectId ?? activeProjectId,
    });
    return jsonOk({ conversation });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create conversation';
    return jsonError(message, 500);
  }
};
