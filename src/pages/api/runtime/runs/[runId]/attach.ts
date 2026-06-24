import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../../lib/api-json';
import { readRunsIndex } from '../../../../../lib/runtime-run-registry';
import { startRunHubFanout } from '../../../../../lib/runtime-hub-stream';

export const POST: APIRoute = async ({ params }) => {
  const runId = params.runId?.trim();
  if (!runId) {
    return jsonError('Run id is required', 400);
  }

  const index = await readRunsIndex();
  const entry = index.active.find((activeRun) => activeRun.runId === runId);
  if (!entry) {
    return jsonError(`Run ${runId} is not active`, 404);
  }

  startRunHubFanout(entry.runId, entry.agentId, entry.conversationId);

  return jsonOk({
    ok: true,
    runId: entry.runId,
    conversationId: entry.conversationId,
    agentId: entry.agentId,
  });
};
