import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../lib/api-json';
import {
  closeBrowserSession,
  createBrowserSession,
  getBrowserSession,
  getBrowserSessionForConversation,
} from '../../../../lib/runtime-browser-bridge';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const GET: APIRoute = async ({ url }) => {
  const sessionId = url.searchParams.get('session_id')?.trim();
  const conversationId = url.searchParams.get('conversation_id')?.trim();

  if (sessionId) {
    const session = getBrowserSession(sessionId);
    if (!session) {
      return jsonError('Browser session not found', 404);
    }
    return jsonOk({ session });
  }

  if (conversationId) {
    const session = getBrowserSessionForConversation(conversationId);
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

  const urlRaw = isRecord(body) && typeof body.url === 'string' ? body.url : '';
  const conversationId =
    isRecord(body) && typeof body.conversation_id === 'string' ? body.conversation_id : undefined;
  const interactive = isRecord(body) && body.interactive === true;

  if (!urlRaw.trim()) {
    return jsonError('url is required', 400);
  }

  try {
    const session = await createBrowserSession({
      url: urlRaw,
      conversationId,
      interactive,
    });
    return jsonOk({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create browser session';
    return jsonError(message, 500);
  }
};

export const DELETE: APIRoute = async ({ url }) => {
  const sessionId = url.searchParams.get('session_id')?.trim();
  if (!sessionId) {
    return jsonError('session_id query parameter is required', 400);
  }

  const closed = await closeBrowserSession(sessionId);
  if (!closed) {
    return jsonError('Browser session not found', 404);
  }

  return jsonOk({ closed: true, sessionId });
};
