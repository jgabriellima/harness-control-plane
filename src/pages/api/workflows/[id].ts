import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { getWorkflowDetail } from '../../../lib/workflows';

export const GET: APIRoute = async ({ params }) => {
  const workflowId = params.id;

  if (!workflowId) {
    return jsonError('Workflow id is required', 400);
  }

  try {
    const workflow = await getWorkflowDetail(workflowId);

    if (!workflow) {
      return jsonError('Workflow not found', 404);
    }

    return jsonOk(workflow);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load workflow';
    return jsonError(message, 500);
  }
};
