import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { loadSettingsSnapshot } from '../../../lib/settings-snapshot';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get('project_id'));
    const settings = await loadSettingsSnapshot(workspaceRoot);
    return jsonOk(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load settings';
    return jsonError(message, 500);
  }
};
