import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../lib/api-json';
import {
  navigateBrowserSession,
  enableUserBrowserWindow,
  performBrowserClick,
  performBrowserKeyPress,
  performBrowserType,
  refreshBrowserSession,
  setBrowserControlMode,
  type BrowserControlMode,
} from '../../../../lib/runtime-browser-bridge';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseControlMode(value: unknown): BrowserControlMode | null {
  if (value === 'user' || value === 'agent') {
    return value;
  }
  return null;
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
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const controlMode = parseControlMode(body.control_mode);
  const text = typeof body.text === 'string' ? body.text : '';
  const key = typeof body.key === 'string' ? body.key.trim() : '';

  if (!sessionId) {
    return jsonError('session_id is required', 400);
  }

  try {
    if (action === 'click' && x !== null && y !== null) {
      await performBrowserClick(sessionId, x, y);
      return jsonOk({ ok: true, action: 'click' });
    }

    if (action === 'navigate' && url) {
      const session = await navigateBrowserSession(sessionId, url);
      return jsonOk({ ok: true, action: 'navigate', session });
    }

    if (action === 'refresh') {
      const session = await refreshBrowserSession(sessionId);
      return jsonOk({ ok: true, action: 'refresh', session });
    }

    if (action === 'set_control_mode' && controlMode) {
      const session = await setBrowserControlMode(sessionId, controlMode);
      return jsonOk({ ok: true, action: 'set_control_mode', session });
    }

    if (action === 'type' && text) {
      await performBrowserType(sessionId, text);
      return jsonOk({ ok: true, action: 'type' });
    }

    if (action === 'keydown' && key) {
      await performBrowserKeyPress(sessionId, key);
      return jsonOk({ ok: true, action: 'keydown' });
    }

    if (action === 'open_user_browser') {
      const session = await enableUserBrowserWindow(sessionId);
      return jsonOk({ ok: true, action: 'open_user_browser', session });
    }

    return jsonError('Unsupported action', 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Browser action failed';
    return jsonError(message, 500);
  }
};
