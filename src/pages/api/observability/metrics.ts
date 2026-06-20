import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { collectObservabilityMetrics } from '../../../lib/observability-metrics';

export const GET: APIRoute = async () => {
  try {
    const metrics = await collectObservabilityMetrics();
    return jsonOk(metrics);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to collect observability metrics';
    return jsonError(message, 500);
  }
};
