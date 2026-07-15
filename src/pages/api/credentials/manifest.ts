import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { loadCredentialManifest } from '../../../lib/credential-manifest';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get('project_id'));
    const manifest = await loadCredentialManifest(workspaceRoot);
    if (!manifest) {
      return jsonOk({
        generated_at: null,
        source: 'missing',
        secrets: [],
      });
    }
    return jsonOk(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load credential manifest';
    return jsonError(message, 500);
  }
};
