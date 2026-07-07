import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../../lib/api-json';
import { appendRunInterrupted } from '../../../../../lib/runtime-run-interrupt';
import { findActiveRunEntry } from '../../../../../lib/runtime-run-registry';
import { broadcastRunInterrupted } from '../../../../../lib/runtime-hub-stream';

export const POST: APIRoute = async ({ params }) => {
  const runId = params.runId?.trim();
  if (!runId) {
    return jsonError('Run id is required', 400);
  }

  const located = await findActiveRunEntry(runId);
  if (!located) {
    return jsonOk({ ok: true, purged: false, reason: 'not_indexed' });
  }

  const { entry, workspaceRoot } = located;

  broadcastRunInterrupted({
    runId,
    agentId: entry.agentId,
    conversationId: entry.conversationId,
    reason: 'stale_reattach',
    message: 'Run removed from active index — attach failed or process restarted',
  });

  try {
    await appendRunInterrupted({
      runId,
      reason: 'stale_reattach',
      message: 'Run removed from active index — attach failed or process restarted',
      resumable: true,
      workspaceRoot,
    });
  } catch {
    return jsonError('Failed to reconcile stale run', 500);
  }

  return jsonOk({ ok: true, purged: true, runId });
};
