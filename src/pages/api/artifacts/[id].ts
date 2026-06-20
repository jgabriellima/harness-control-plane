import type { APIRoute } from 'astro';

import { getArtifactDetail } from '../../../lib/artifacts';
import { jsonError, jsonOk } from '../../../lib/api-json';

export const GET: APIRoute = async ({ params }) => {
  const artifactId = params.id;

  if (!artifactId) {
    return jsonError('Artifact id is required', 400);
  }

  try {
    const artifact = await getArtifactDetail(artifactId);

    if (!artifact) {
      return jsonError('Artifact not found', 404);
    }

    return jsonOk(artifact);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load artifact';
    return jsonError(message, 500);
  }
};
