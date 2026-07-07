import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../../lib/api-json';
import { appendRunInterrupted } from '../../../../../lib/runtime-run-interrupt';
import { findActiveRunEntry } from '../../../../../lib/runtime-run-registry';
import { broadcastRunInterrupted, startRunHubFanout } from '../../../../../lib/runtime-hub-stream';
import { probeRunLiveness } from '../../../../../lib/runtime-run-liveness';
import { registerRuntimeRun } from '../../../../../lib/runtime-sessions';

export const POST: APIRoute = async ({ params }) => {
  const runId = params.runId?.trim();
  if (!runId) {
    return jsonError('Run id is required', 400);
  }

  const located = await findActiveRunEntry(runId);
  if (!located) {
    return jsonError(`Run ${runId} is not active`, 404);
  }

  const { entry, workspaceRoot } = located;

  let probe;
  try {
    probe = await probeRunLiveness(entry.runId, workspaceRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Run liveness probe failed';
    return jsonError(message, 503);
  }

  if (probe.liveness === 'not_found' || probe.liveness === 'terminal') {
    const message =
      probe.liveness === 'not_found'
        ? `Run ${entry.runId} not found in local SDK store`
        : `Run ${entry.runId} already terminal`;

    broadcastRunInterrupted({
      runId: entry.runId,
      agentId: entry.agentId,
      conversationId: entry.conversationId,
      reason: 'stale_reattach',
      message,
    });

    try {
      await appendRunInterrupted({
        runId: entry.runId,
        reason: 'stale_reattach',
        message,
        resumable: true,
        workspaceRoot,
      });
    } catch {
      return jsonError('Failed to reconcile stale run', 500);
    }

    return jsonOk({ ok: false, purged: true, runId: entry.runId, reason: probe.liveness }, 410);
  }

  if (probe.liveness === 'unavailable') {
    return jsonError('Runtime SDK unavailable — cannot attach run', 503);
  }

  if (probe.run) {
    registerRuntimeRun(entry.runId, probe.run, entry.conversationId, entry.agentId);
  }

  startRunHubFanout(entry.runId, entry.agentId, entry.conversationId, workspaceRoot, {
    silent: true,
  });

  return jsonOk({
    ok: true,
    runId: entry.runId,
    conversationId: entry.conversationId,
    agentId: entry.agentId,
  });
};
