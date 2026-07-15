import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { listWorkflowSummaries } from '../../../lib/workflows';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get('project_id'));
    const workflows = await listWorkflowSummaries(workspaceRoot);
    return jsonOk({ workflows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list workflows';
    return jsonError(message, 500);
  }
};
