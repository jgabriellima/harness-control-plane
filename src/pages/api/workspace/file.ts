import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { readWorkspaceFile } from '../../../lib/workspace-files';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';

export const GET: APIRoute = async ({ url, request }) => {
  const requestedPath = url.searchParams.get('path');

  if (!requestedPath) {
    return jsonError('Query parameter "path" is required', 400);
  }

  try {
    const projectId = url.searchParams.get('project_id')?.trim() || undefined;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const file = await readWorkspaceFile(requestedPath, workspaceRoot);

    if (!file) {
      return jsonError('File not found', 404);
    }

    return jsonOk(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read workspace file';
    return jsonError(message, 500);
  }
};
