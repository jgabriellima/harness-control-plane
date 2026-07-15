import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../../../lib/api-json';
import { appendRunInterrupted } from '../../../../../lib/runtime-run-interrupt';
import { findActiveRunEntry, type ActiveRunEntry } from '../../../../../lib/runtime-run-registry';
import {
  broadcastRunInterrupted,
  broadcastRunRecoveredComplete,
  startRunHubFanout,
} from '../../../../../lib/runtime-hub-stream';
import {
  isSuccessfulTerminalStatus,
  probeRunLiveness,
  probeRunLivenessAcrossWorkspaces,
} from '../../../../../lib/runtime-run-liveness';
import { classifyRunTerminalOutcome } from '../../../../../lib/runtime-run-failure';
import { findRunRegistryMetadata } from '../../../../../lib/runtime-run-recovery';
import { registerRuntimeRun } from '../../../../../lib/runtime-sessions';
import { markRunExecutingInProcessSession } from '../../../../../lib/runtime-process-session';

interface AttachRunContext {
  entry: ActiveRunEntry;
  workspaceRoot: string;
  indexed: boolean;
}

async function resolveAttachRunContext(runId: string): Promise<AttachRunContext | null> {
  const located = await findActiveRunEntry(runId);
  if (located) {
    return { entry: located.entry, workspaceRoot: located.workspaceRoot, indexed: true };
  }

  const probe = await probeRunLivenessAcrossWorkspaces(runId);
  if (probe.liveness === 'not_found' || !probe.workspaceRoot) {
    return null;
  }

  const metadata = await findRunRegistryMetadata(runId, probe.workspaceRoot);
  if (!metadata) {
    return null;
  }

  return {
    entry: {
      runId,
      conversationId: metadata.conversationId,
      agentId: metadata.agentId,
      startedAt: new Date().toISOString(),
    },
    workspaceRoot: metadata.workspaceRoot,
    indexed: false,
  };
}

function terminalStatusFromProbe(
  probe: Awaited<ReturnType<typeof probeRunLiveness>>,
): string {
  const status = typeof probe.run?.status === 'string' ? probe.run.status : 'completed';
  if (probe.liveness === 'not_found') {
    return 'not_found';
  }
  return status;
}

async function handleTerminalAttach(
  context: AttachRunContext,
  probe: Awaited<ReturnType<typeof probeRunLiveness>>,
): Promise<Response> {
  const { entry, workspaceRoot } = context;
  const status = terminalStatusFromProbe(probe);
  const outcome = classifyRunTerminalOutcome(
    status,
    typeof probe.run?.result === 'string' ? probe.run.result : undefined,
  );

  if (isSuccessfulTerminalStatus(status) && !outcome.failed) {
    broadcastRunRecoveredComplete({
      runId: entry.runId,
      agentId: entry.agentId,
      conversationId: entry.conversationId,
      status,
    });

    return jsonOk({
      ok: true,
      recovered: 'completed',
      runId: entry.runId,
      conversationId: entry.conversationId,
      agentId: entry.agentId,
      status,
    });
  }

  const message =
    outcome.errorMessage ??
    (probe.liveness === 'not_found'
      ? `Run ${entry.runId} not found in local SDK store`
      : `Run ${entry.runId} already terminal`);

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

  return jsonOk(
    {
      ok: false,
      purged: true,
      recovered: outcome.failed ? 'failed' : 'stale',
      runId: entry.runId,
      reason: probe.liveness,
      status,
      message,
    },
    410,
  );
}

export const POST: APIRoute = async ({ params }) => {
  const runId = params.runId?.trim();
  if (!runId) {
    return jsonError('Run id is required', 400);
  }

  const context = await resolveAttachRunContext(runId);
  if (!context) {
    return jsonError(`Run ${runId} is not active`, 404);
  }

  const { entry, workspaceRoot } = context;

  let probe;
  try {
    probe = await probeRunLiveness(entry.runId, workspaceRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Run liveness probe failed';
    return jsonError(message, 503);
  }

  if (probe.liveness === 'terminal' || probe.liveness === 'not_found') {
    return handleTerminalAttach(context, probe);
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
  markRunExecutingInProcessSession(entry.runId);

  return jsonOk({
    ok: true,
    runId: entry.runId,
    conversationId: entry.conversationId,
    agentId: entry.agentId,
  });
};
