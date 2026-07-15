import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import {
  isReaderFontSize,
  isReaderLineHeight,
  isReaderSpacing,
} from '../../../lib/reader-preferences';
import { patchReaderPreferences, readReaderPreferences } from '../../../lib/ui-reader-preferences';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get('project_id'));
    const preferences = await readReaderPreferences(workspaceRoot);
    return jsonOk(preferences);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load reader preferences';
    return jsonError(message, 500);
  }
};

export const PATCH: APIRoute = async ({ request, url }) => {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError('Request body must be valid JSON', 400);
  }

  if (!isRecord(body)) {
    return jsonError('Request body must be a JSON object', 400);
  }

  if (body.fontSize !== undefined && !isReaderFontSize(body.fontSize)) {
    return jsonError('fontSize must be one of: sm, base, lg, xl', 400);
  }

  if (body.lineHeight !== undefined && !isReaderLineHeight(body.lineHeight)) {
    return jsonError('lineHeight must be one of: tight, normal, relaxed, loose', 400);
  }

  if (body.spacing !== undefined && !isReaderSpacing(body.spacing)) {
    return jsonError('spacing must be one of: compact, comfortable, airy', 400);
  }

  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get('project_id'));
    const preferences = await patchReaderPreferences({
      fontSize: isReaderFontSize(body.fontSize) ? body.fontSize : undefined,
      lineHeight: isReaderLineHeight(body.lineHeight) ? body.lineHeight : undefined,
      spacing: isReaderSpacing(body.spacing) ? body.spacing : undefined,
    }, workspaceRoot);
    return jsonOk(preferences);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update reader preferences';
    return jsonError(message, 500);
  }
};
