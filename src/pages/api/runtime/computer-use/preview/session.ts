import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../../lib/api-json';
import {
  closeComputerUsePreviewSession,
  createComputerUsePreviewSession,
  getComputerUsePreviewSession,
  getComputerUsePreviewSessionForConversation,
  refreshSandboxPreviewSession,
} from '../../../../../lib/runtime-computer-use-panel-bridge';
import { loadComputerUseSession } from '../../../../../lib/runtime-computer-use-sessions';
import { parseComputerUseTargetMode } from '../../../../../lib/runtime-computer-use-types';
import { broadcastComputerUsePreviewReady } from '../../../../../lib/runtime-hub-stream';
import { resolveRequestWorkspace } from '../../../../../lib/workspace-request';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const GET: APIRoute = async ({ url }) => {
  const sessionId = url.searchParams.get('session_id')?.trim();
  const conversationId = url.searchParams.get('conversation_id')?.trim();

  if (sessionId) {
    let session = getComputerUsePreviewSession(sessionId);
    if (session?.streamKind === 'sandbox_vnc' && session.status !== 'ready') {
      session = (await refreshSandboxPreviewSession(sessionId)) ?? session;
    }
    if (!session) {
      return jsonError('Computer-use preview session not found', 404);
    }
    return jsonOk({ session });
  }

  if (conversationId) {
    const session = getComputerUsePreviewSessionForConversation(conversationId);
    if (!session) {
      return jsonOk({ session: null });
    }
    return jsonOk({ session });
  }

  return jsonError('session_id or conversation_id query parameter is required', 400);
};

export const POST: APIRoute = async ({ request }) => {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const conversationId =
    isRecord(body) && typeof body.conversation_id === 'string' ? body.conversation_id : undefined;

  let targetMode = isRecord(body) ? parseComputerUseTargetMode(body.target_mode) : null;

  try {
    const forceRestart = isRecord(body) && body.force_restart === true;

    if (!targetMode && conversationId) {
      const projectId =
        isRecord(body) && typeof body.project_id === 'string' ? body.project_id : undefined;
      const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
      const chatSession = await loadComputerUseSession(conversationId, workspaceRoot);
      targetMode = chatSession.mode ?? 'host';
    }

    const projectId =
      isRecord(body) && typeof body.project_id === 'string' ? body.project_id : undefined;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);

    const session = await createComputerUsePreviewSession({
      conversationId,
      projectId: projectId ?? 'default',
      targetMode: targetMode ?? 'host',
      forceRestart,
      workspaceRoot,
    });

    broadcastComputerUsePreviewReady({
      conversationId: session.conversationId,
      sessionId: session.sessionId,
    });

    return jsonOk({ session });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create computer-use preview session';
    return jsonError(message, 500);
  }
};

export const DELETE: APIRoute = async ({ url }) => {
  const sessionId = url.searchParams.get('session_id')?.trim();
  if (!sessionId) {
    return jsonError('session_id query parameter is required', 400);
  }

  const closed = await closeComputerUsePreviewSession(sessionId);
  if (!closed) {
    return jsonError('Computer-use preview session not found', 404);
  }

  return jsonOk({ closed: true, sessionId });
};
