import type { APIRoute } from 'astro';

import { createRuntimeEventStream } from '../../../lib/runtime-stream';

export const GET: APIRoute = async ({ request, url }) => {
  const runId = url.searchParams.get('run_id')?.trim();
  const agentId = url.searchParams.get('agent_id')?.trim();

  if (!runId || !agentId) {
    return new Response('run_id and agent_id are required', { status: 400 });
  }

  const stream = createRuntimeEventStream(runId, agentId, request.signal);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
};
