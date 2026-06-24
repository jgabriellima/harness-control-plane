import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../../lib/api-json';
import { appendRunTerminal, readRunsIndex } from '../../../../../lib/runtime-run-registry';

export const POST: APIRoute = async ({ params }) => {
  const runId = params.runId?.trim();
  if (!runId) {
    return jsonError('Run id is required', 400);
  }

  const index = await readRunsIndex();
  const entry = index.active.find((activeRun) => activeRun.runId === runId);
  if (!entry) {
    return jsonOk({ ok: true, purged: false, reason: 'not_indexed' });
  }

  try {
    await appendRunTerminal({
      runId,
      event: 'run.failed',
      status: 'stale',
      message: 'Run removed from active index — attach failed or process restarted',
    });
  } catch {
    return jsonError('Failed to reconcile stale run', 500);
  }

  return jsonOk({ ok: true, purged: true, runId });
};
