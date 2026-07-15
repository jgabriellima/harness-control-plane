import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { isRichUiMode } from '../../../lib/presentation-types';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';
import {
  patchWorkspacePresentation,
  readWorkspacePresentation,
} from '../../../lib/workspace-presentation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const projectId = url.searchParams.get('project_id')?.trim();
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const manifest = await readWorkspacePresentation(workspaceRoot);
    return jsonOk(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load presentation settings';
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

  const richUi = body.richUi ?? body.rich_ui;
  if (richUi !== undefined && !isRichUiMode(richUi)) {
    return jsonError('richUi must be one of: off, adaptive, always', 400);
  }

  try {
    const projectId = url.searchParams.get('project_id')?.trim();
    const { workspaceRoot, activeProjectId } = await resolveRequestWorkspace(request, projectId);
    const manifest = await patchWorkspacePresentation(workspaceRoot, {
      richUi: isRichUiMode(richUi) ? richUi : undefined,
    });
    return jsonOk({
      ...manifest,
      project_id: activeProjectId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update presentation settings';
    return jsonError(message, 500);
  }
};
