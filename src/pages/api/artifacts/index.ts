import type { APIRoute } from 'astro';

import { listArtifactSummaries } from '../../../lib/artifacts';
import { jsonError, jsonOk } from '../../../lib/api-json';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get('project_id'));
    const artifacts = await listArtifactSummaries(workspaceRoot);
    return jsonOk({ artifacts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list artifacts';
    return jsonError(message, 500);
  }
};
