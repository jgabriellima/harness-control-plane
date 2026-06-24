import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../lib/api-json';
import { performBrowserClick } from '../../../../lib/runtime-browser-bridge';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return jsonError('Request body must be valid JSON', 400);
  }

  if (!isRecord(body)) {
    return jsonError('Request body must be a JSON object', 400);
  }

  const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  const x = typeof body.x === 'number' ? body.x : null;
  const y = typeof body.y === 'number' ? body.y : null;

  if (!sessionId) {
    return jsonError('session_id is required', 400);
  }

  try {
    if (action === 'click' && x !== null && y !== null) {
      await performBrowserClick(sessionId, x, y);
      return jsonOk({ ok: true, action: 'click' });
    }

    return jsonError('Unsupported action', 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Browser action failed';
    return jsonError(message, 500);
  }
};
