import type { Run } from '@cursor/sdk';

import { appendRunInterrupted } from './runtime-run-interrupt';
import {
  appendRunTerminal,
  findActiveRunEntry,
  readAggregatedActiveRuns,
  type ActiveRunEntry,
} from './runtime-run-registry';
import { probeRunLiveness } from './runtime-run-liveness';
import { broadcastRunInterrupted } from './runtime-hub-stream';
import { errorFields, runtimeLogger } from './runtime-logger';
import { localGetRunOptions } from './runtime-sdk-local';

export function isAgentBusyError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AgentBusyError') {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /already has active run/i.test(message);
}

async function cancelAliveRun(
  run: Run,
  entry: ActiveRunEntry,
  workspaceRoot: string,
): Promise<boolean> {
  if (!run.supports('cancel')) {
    return false;
  }

  await run.cancel();

  await appendRunTerminal({
    runId: entry.runId,
    event: 'run.aborted',
    status: 'cancelled',
    workspaceRoot,
  });

  return true;
}

async function reconcileStaleRun(
  entry: ActiveRunEntry,
  workspaceRoot: string,
  message: string,
): Promise<void> {
  broadcastRunInterrupted({
    runId: entry.runId,
    agentId: entry.agentId,
    conversationId: entry.conversationId,
    reason: 'registry_desync',
    message,
  });

  await appendRunInterrupted({
    runId: entry.runId,
    reason: 'registry_desync',
    message,
    resumable: true,
    workspaceRoot,
  });
}

async function releaseIndexedRun(
  entry: ActiveRunEntry,
  fallbackWorkspaceRoot: string,
  requestId: string,
): Promise<boolean> {
  const located = await findActiveRunEntry(entry.runId);
  const workspaceRoot = located?.workspaceRoot ?? fallbackWorkspaceRoot;

  let probe;
  try {
    probe = await probeRunLiveness(entry.runId, workspaceRoot);
  } catch (error) {
    runtimeLogger.warn('chat.sdk.dispatch.release_probe_failed', {
      request_id: requestId,
      run_id: entry.runId,
      agent_id: entry.agentId,
      ...errorFields(error),
    });
    return false;
  }

  if (probe.liveness === 'alive' && probe.run) {
    try {
      const cancelled = await cancelAliveRun(probe.run, entry, workspaceRoot);
      if (cancelled) {
        runtimeLogger.info('chat.sdk.dispatch.release_cancelled', {
          request_id: requestId,
          run_id: entry.runId,
          agent_id: entry.agentId,
          conversation_id: entry.conversationId,
        });
        return true;
      }
    } catch (error) {
      runtimeLogger.warn('chat.sdk.dispatch.release_cancel_failed', {
        request_id: requestId,
        run_id: entry.runId,
        agent_id: entry.agentId,
        ...errorFields(error),
      });
      return false;
    }
  }

  if (probe.liveness === 'terminal' || probe.liveness === 'not_found') {
    const message =
      probe.liveness === 'not_found'
        ? `Run ${entry.runId} not found in local SDK store`
        : `Run ${entry.runId} already terminal`;

    await reconcileStaleRun(entry, workspaceRoot, message);
    runtimeLogger.info('chat.sdk.dispatch.release_reconciled', {
      request_id: requestId,
      run_id: entry.runId,
      agent_id: entry.agentId,
      liveness: probe.liveness,
    });
    return true;
  }

  return false;
}

async function releaseSdkRunningRuns(
  agentId: string,
  workspaceRoot: string,
  requestId: string,
): Promise<boolean> {
  const { Agent } = await import('@cursor/sdk');
  const listResult = await Agent.listRuns(agentId, {
    runtime: 'local',
    cwd: workspaceRoot,
    limit: 8,
  });

  let released = false;

  for (const run of listResult.items) {
    if (run.status !== 'running') {
      continue;
    }

    try {
      if (run.supports('cancel')) {
        await run.cancel();
      }

      await appendRunTerminal({
        runId: run.id,
        event: 'run.aborted',
        status: 'cancelled',
        workspaceRoot,
      });

      runtimeLogger.info('chat.sdk.dispatch.release_sdk_cancelled', {
        request_id: requestId,
        run_id: run.id,
        agent_id: agentId,
      });
      released = true;
    } catch (error) {
      runtimeLogger.warn('chat.sdk.dispatch.release_sdk_cancel_failed', {
        request_id: requestId,
        run_id: run.id,
        agent_id: agentId,
        ...errorFields(error),
      });
    }
  }

  return released;
}

/**
 * Cancels or reconciles non-terminal runs blocking a new SDK turn for the agent.
 * Required when the UI lost streaming state but the local agent store still
 * reports an active run (AgentBusyError on agent.send).
 */
export async function releaseBlockingAgentRuns(input: {
  agentId: string;
  conversationId: string;
  workspaceRoot: string;
  requestId: string;
}): Promise<number> {
  const index = await readAggregatedActiveRuns();
  const indexedCandidates = index.active.filter((entry) => entry.agentId === input.agentId);

  let releasedCount = 0;

  for (const entry of indexedCandidates) {
    const released = await releaseIndexedRun(entry, input.workspaceRoot, input.requestId);
    if (released) {
      releasedCount += 1;
    }
  }

  if (releasedCount === 0) {
    const sdkReleased = await releaseSdkRunningRuns(
      input.agentId,
      input.workspaceRoot,
      input.requestId,
    );
    if (sdkReleased) {
      releasedCount += 1;
    }
  }

  return releasedCount;
}

export async function sendAgentPromptWithRelease(input: {
  agent: { agentId: string; send: (message: string) => Promise<Run> };
  prompt: string;
  conversationId: string;
  workspaceRoot: string;
  requestId: string;
  timeoutMs: number;
  withTimeout: <T>(promise: Promise<T>, timeoutMs: number, requestId: string) => Promise<T>;
}): Promise<Run> {
  await releaseBlockingAgentRuns({
    agentId: input.agent.agentId,
    conversationId: input.conversationId,
    workspaceRoot: input.workspaceRoot,
    requestId: input.requestId,
  });

  try {
    return await input.withTimeout(input.agent.send(input.prompt), input.timeoutMs, input.requestId);
  } catch (error) {
    if (!isAgentBusyError(error)) {
      throw error;
    }

    runtimeLogger.warn('chat.sdk.dispatch.agent_busy_retry', {
      request_id: input.requestId,
      agent_id: input.agent.agentId,
      conversation_id: input.conversationId,
      ...errorFields(error),
    });

    await releaseBlockingAgentRuns({
      agentId: input.agent.agentId,
      conversationId: input.conversationId,
      workspaceRoot: input.workspaceRoot,
      requestId: input.requestId,
    });

    return input.withTimeout(input.agent.send(input.prompt), input.timeoutMs, input.requestId);
  }
}
