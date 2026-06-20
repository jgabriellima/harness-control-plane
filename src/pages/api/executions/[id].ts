import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { getExecutionDetail } from '../../../lib/harness-reader';

export const GET: APIRoute = async ({ params }) => {
  const executionId = params.id;

  if (!executionId) {
    return jsonError('Execution id is required', 400);
  }

  try {
    const execution = await getExecutionDetail(executionId);

    if (!execution) {
      return jsonError('Execution not found', 404);
    }

    return jsonOk(execution);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load execution';
    return jsonError(message, 500);
  }
};
