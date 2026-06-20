import type { APIRoute } from 'astro';

import { createRuntimeHubEventStream } from '../../../../lib/runtime-hub-stream';

export const GET: APIRoute = async ({ request }) => {
  const stream = createRuntimeHubEventStream(request.signal);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
};
