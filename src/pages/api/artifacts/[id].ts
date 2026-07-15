import type { APIRoute } from 'astro';

import { getArtifactDetail } from '../../../lib/artifacts';
import { jsonError, jsonOk } from '../../../lib/api-json';
import { resolveRequestWorkspace } from '../../../lib/workspace-request';

export const GET: APIRoute = async ({ params, request, url }) => {
  const artifactId = params.id;

  if (!artifactId) {
    return jsonError('Artifact id is required', 400);
  }

  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get('project_id'));
    const artifact = await getArtifactDetail(artifactId, workspaceRoot);

    if (!artifact) {
      return jsonError('Artifact not found', 404);
    }

    return jsonOk(artifact);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load artifact';
    return jsonError(message, 500);
  }
};
