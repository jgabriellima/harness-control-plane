import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { listHarnessCommands } from '../../../lib/harness-commands';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const projectId = url.searchParams.get('project_id')?.trim() || undefined;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const commands = await listHarnessCommands(workspaceRoot);
    return jsonOk({ commands });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load harness commands';
    return jsonError(message, 500);
  }
};
