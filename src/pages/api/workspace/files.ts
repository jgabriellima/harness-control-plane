import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { listWorkspaceMentionFiles } from '../../../lib/workspace-file-index';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';

export const GET: APIRoute = async ({ url, request }) => {
  const query = url.searchParams.get('q') ?? '';

  try {
    const projectId = url.searchParams.get('project_id')?.trim() || undefined;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const files = await listWorkspaceMentionFiles(workspaceRoot, query);

    return jsonOk({ files });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list workspace files';
    return jsonError(message, 500);
  }
};
