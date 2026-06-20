import type { APIRoute } from 'astro';

import {
  deleteConversation,
  getConversationById,
  loadConversationTranscript,
  patchConversation,
  updateConversationAgent,
} from '../../../lib/conversation-store';
import { jsonError, jsonOk } from '../../../lib/api-json';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const GET: APIRoute = async ({ params, request, url }) => {
  const conversationId = params.id;

  if (!conversationId) {
    return jsonError('Conversation id is required', 400);
  }

  try {
    const projectId = url.searchParams.get('project_id')?.trim() || undefined;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const conversation = await getConversationById(workspaceRoot, conversationId);

    if (!conversation) {
      return jsonError('Conversation not found', 404);
    }

    const messages = await loadConversationTranscript(workspaceRoot, conversationId);

    return jsonOk({
      id: conversation.id,
      title: conversation.title,
      projectId: conversation.projectId,
      updatedAt: conversation.updatedAt,
      agentId: conversation.agentId ?? null,
      archived: conversation.archived ?? false,
      messages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load conversation';
    return jsonError(message, 500);
  }
};

export const PATCH: APIRoute = async ({ params, request, url }) => {
  const conversationId = params.id;

  if (!conversationId) {
    return jsonError('Conversation id is required', 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Request body must be valid JSON', 400);
  }

  if (!isRecord(body)) {
    return jsonError('Request body must be a JSON object', 400);
  }

  try {
    const projectId = url.searchParams.get('project_id')?.trim() || undefined;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);

    if (typeof body.agent_id === 'string') {
      const conversation = await updateConversationAgent(
        workspaceRoot,
        conversationId,
        body.agent_id,
      );
      if (!conversation) {
        return jsonError('Conversation not found', 404);
      }
      return jsonOk({ conversation });
    }

    if (Array.isArray(body.messages)) {
      return jsonError(
        'Transcript PATCH is deprecated — messages are sourced from vendor storage via session registry',
        410,
      );
    }

    const title = typeof body.title === 'string' ? body.title : undefined;
    const archived = typeof body.archived === 'boolean' ? body.archived : undefined;
    const moveProjectId =
      typeof body.project_id === 'string' ? body.project_id.trim() : undefined;

    if (title !== undefined || archived !== undefined || moveProjectId) {
      const conversation = await patchConversation(workspaceRoot, conversationId, {
        title,
        archived,
        projectId: moveProjectId,
      });
      if (!conversation) {
        return jsonError('Conversation not found', 404);
      }
      return jsonOk({ conversation });
    }

    return jsonError('No supported patch fields provided', 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update conversation';
    return jsonError(message, 500);
  }
};

export const DELETE: APIRoute = async ({ params, request, url }) => {
  const conversationId = params.id;

  if (!conversationId) {
    return jsonError('Conversation id is required', 400);
  }

  try {
    const projectId = url.searchParams.get('project_id')?.trim() || undefined;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const deleted = await deleteConversation(workspaceRoot, conversationId);

    if (!deleted) {
      return jsonError('Conversation not found', 404);
    }

    return jsonOk({ deleted: true, id: conversationId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete conversation';
    return jsonError(message, 500);
  }
};
