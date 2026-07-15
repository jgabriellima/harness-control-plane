import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { resolveReadinessSnapshot } from '../../../lib/integration-readiness';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';
import { ensureWorkspacesContainer } from '../../../lib/workspaces-root';

export const GET: APIRoute = async ({ request, url }) => {
  try {
    await ensureWorkspacesContainer();
    const workspace = await resolveRequestWorkspace(request, url.searchParams.get('project_id'));
    const snapshot = await resolveReadinessSnapshot(
      workspace.workspaceRoot,
      workspace.activeProjectId,
    );
    return jsonOk(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load readiness snapshot';
    return jsonError(message, 500);
  }
};
