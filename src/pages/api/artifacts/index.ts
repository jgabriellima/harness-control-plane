import type { APIRoute } from 'astro';

import { listArtifactSummaries } from '../../../lib/artifacts';
import { jsonError, jsonOk } from '../../../lib/api-json';

export const GET: APIRoute = async () => {
  try {
    const artifacts = await listArtifactSummaries();
    return jsonOk({ artifacts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list artifacts';
    return jsonError(message, 500);
  }
};
