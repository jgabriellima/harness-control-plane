import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { listWorkflowSummaries } from '../../../lib/workflows';

export const GET: APIRoute = async () => {
  try {
    const workflows = await listWorkflowSummaries();
    return jsonOk({ workflows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list workflows';
    return jsonError(message, 500);
  }
};
