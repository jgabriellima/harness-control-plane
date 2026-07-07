import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import { interruptAllActiveRuns, readAggregatedActiveRuns } from '../../../lib/runtime-run-registry';
import { broadcastRunInterrupted } from '../../../lib/runtime-hub-stream';

export const POST: APIRoute = async ({ request }) => {
  let reason = 'app_close';

  try {
    const body = (await request.json()) as { reason?: string };
    if (typeof body.reason === 'string' && body.reason.trim().length > 0) {
      reason = body.reason.trim();
    }
  } catch {
    // Default reason when body is absent.
  }

  const index = await readAggregatedActiveRuns();

  for (const entry of index.active) {
    broadcastRunInterrupted({
      runId: entry.runId,
      agentId: entry.agentId,
      conversationId: entry.conversationId,
      reason,
      message: `Run interrupted (${reason})`,
    });
  }

  try {
    const interrupted = await interruptAllActiveRuns(reason);
    return jsonOk({ ok: true, interrupted, reason });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to interrupt active runs';
    return jsonError(message, 500);
  }
};
