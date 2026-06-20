import type { APIRoute } from 'astro';

import { jsonError } from '../../../../lib/api-json';
import { createExecutionEventStream } from '../../../../lib/execution-sse';
import { getExecutionDetail } from '../../../../lib/harness-reader';

export const GET: APIRoute = async ({ params, request }) => {
  const executionId = params.id;

  if (!executionId) {
    return jsonError('Execution id is required', 400);
  }

  const detail = await getExecutionDetail(executionId);
  if (!detail) {
    return jsonError('Execution not found', 404);
  }

  const stream = createExecutionEventStream(executionId, request.signal);

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
};
