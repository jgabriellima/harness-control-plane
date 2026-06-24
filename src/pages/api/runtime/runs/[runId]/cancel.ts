import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../../lib/api-json';
import { cancelRuntimeRun } from '../../../../../lib/runtime-hub-stream';

export const POST: APIRoute = async ({ params }) => {
  const runId = params.runId?.trim();
  if (!runId) {
    return jsonError('runId is required', 400);
  }

  const result = await cancelRuntimeRun(runId);
  if (!result.ok) {
    return jsonError(result.message ?? 'Cancel failed', 409);
  }

  return jsonOk({ run_id: runId, status: 'cancelled' });
};
