import type { Run, SDKMessage } from '@cursor/sdk';

import { joinAssistantTextBlocks } from './assistant-text';
import { appendDispatchLog } from './runtime-dispatch-log';
import {
  formatRuntimeConnectError,
  isConnectCanceled,
  isConnectUnauthenticated,
} from './runtime-connect-errors';
import { installRuntimeProcessGuard } from './runtime-process-guard';
import { appendRunTerminal, readAggregatedActiveRuns } from './runtime-run-registry';
import { errorFields, runtimeLogger } from './runtime-logger';
import { hasRuntimeSdkCredentials, localGetRunOptions } from './runtime-sdk-local';
import {
  canAttemptRuntimeSdkCall,
  markRuntimeAuthUnavailable,
} from './runtime-sdk-auth-gate';
import { consumeRunStream, resolveRunTerminalStatus } from './runtime-sdk-stream';
import {
  getActiveRunIds,
  getRuntimeRunEntry,
  registerRuntimeRun,
  releaseAgentSlot,
  releaseRuntimeRun,
  retainRuntimeRun,
  runWithWorkspaceCwdAsync,
  workspaceCwd,
} from './runtime-sessions';
import type { RuntimeHubWireEvent } from './runtime-hub-types';

installRuntimeProcessGuard();

export interface RunHubFanoutOptions {
  requestId?: string;
  /** Background reattach — never broadcast runtime errors into live chat UI. */
  silent?: boolean;
}

export interface RuntimeStreamWireEvent {
  type: string;
  run_id: string;
  agent_id: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

function encodeSseData(event: RuntimeHubWireEvent | RuntimeStreamWireEvent): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

function encodeSseHeartbeat(): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(': heartbeat\n\n');
}

export function wireFromSdkMessage(
  message: SDKMessage,
  runId: string,
  agentId: string,
  conversationId: string,
): RuntimeHubWireEvent | null {
  const timestamp = new Date().toISOString();

  if (message.type === 'assistant') {
    const textBlocks = joinAssistantTextBlocks(
      message.message.content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map((block) => block.text),
    );

    return {
      type: 'assistant',
      run_id: runId,
      agent_id: agentId,
      conversation_id: conversationId,
      timestamp,
      payload: { text: textBlocks },
    };
  }

  if (message.type === 'tool_call') {
    return {
      type: 'tool_call',
      run_id: runId,
      agent_id: agentId,
      conversation_id: conversationId,
      timestamp,
      payload: {
        tool: message.name,
        status: message.status,
        args: message.args,
        result: message.result,
      },
    };
  }

  if (message.type === 'thinking') {
    return {
      type: 'thinking',
      run_id: runId,
      agent_id: agentId,
      conversation_id: conversationId,
      timestamp,
      payload: {
        text: message.text,
        duration_ms: message.thinking_duration_ms,
      },
    };
  }

  return {
    type: message.type,
    run_id: runId,
    agent_id: agentId,
    conversation_id: conversationId,
    timestamp,
    payload: {},
  };
}

type HubClient = {
  enqueue: (chunk: Uint8Array) => void;
  close: () => void;
};

const hubClients = new Set<HubClient>();
const fanoutStarted = new Set<string>();

function broadcastEvent(event: RuntimeHubWireEvent | RuntimeStreamWireEvent): void {
  const chunk = encodeSseData(event);
  for (const client of hubClients) {
    try {
      client.enqueue(chunk);
    } catch {
      client.close();
      hubClients.delete(client);
    }
  }
}

interface CompleteRunFanoutOptions {
  workspaceRoot?: string;
  notifyClient?: boolean;
  errorMessage?: string;
}

async function completeRunFanout(
  runId: string,
  agentId: string,
  conversationId: string,
  status: string,
  options: CompleteRunFanoutOptions = {},
): Promise<void> {
  const resolvedWorkspaceRoot = options.workspaceRoot ?? workspaceCwd();
  const notifyClient = options.notifyClient !== false;
  const errorMessage = options.errorMessage;

  if (errorMessage) {
    if (notifyClient) {
      broadcastEvent({
        type: 'error',
        run_id: runId,
        agent_id: agentId,
        conversation_id: conversationId,
        timestamp: new Date().toISOString(),
        payload: { message: errorMessage },
      });
    }

    try {
      await appendRunTerminal({
        runId,
        event: 'run.failed',
        message: errorMessage,
        workspaceRoot: resolvedWorkspaceRoot,
      });
    } catch {
      // Registry append is best-effort on terminal path.
    }
  } else if (notifyClient) {
    broadcastEvent({
      type: 'run_complete',
      run_id: runId,
      agent_id: agentId,
      conversation_id: conversationId,
      timestamp: new Date().toISOString(),
      payload: { status },
    });

    try {
      await appendRunTerminal({
        runId,
        event: 'run.completed',
        status,
        workspaceRoot: resolvedWorkspaceRoot,
      });
    } catch {
      // Registry append is best-effort on terminal path.
    }
  } else {
    try {
      await appendRunTerminal({
        runId,
        event: 'run.failed',
        status: 'stale',
        message: 'Background run reattach abandoned',
        workspaceRoot: resolvedWorkspaceRoot,
      });
    } catch {
      // Registry append is best-effort on terminal path.
    }
  }

  releaseRuntimeRun(runId);
  releaseAgentSlot();
  fanoutStarted.delete(runId);
}

async function abandonRunFanout(
  runId: string,
  agentId: string,
  conversationId: string,
  cwd: string,
  reason: string,
): Promise<void> {
  runtimeLogger.debug('chat.fanout.abandoned', {
    run_id: runId,
    agent_id: agentId,
    conversation_id: conversationId,
    reason,
  });

  await completeRunFanout(runId, agentId, conversationId, 'failed', {
    workspaceRoot: cwd,
    notifyClient: false,
    errorMessage: reason,
  });
}

export async function cancelRuntimeRun(runId: string): Promise<{ ok: boolean; message?: string }> {
  const entry = getRuntimeRunEntry(runId);
  if (!entry) {
    return { ok: false, message: `Run ${runId} not found` };
  }

  const { run, conversationId, agentId } = entry;
  if (!run.supports('cancel')) {
    return { ok: false, message: run.unsupportedReason('cancel') ?? 'Cancel not supported' };
  }

  try {
    await run.cancel();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cancel failed';
    return { ok: false, message };
  }

  if (conversationId && agentId) {
    broadcastEvent({
      type: 'run.aborted',
      run_id: runId,
      agent_id: agentId,
      conversation_id: conversationId,
      timestamp: new Date().toISOString(),
      payload: { status: 'cancelled' },
    });
  }

  try {
    await appendRunTerminal({
      runId,
      event: 'run.aborted',
      status: 'cancelled',
      workspaceRoot: workspaceCwd(),
    });
  } catch {
    // Registry append is best-effort.
  }

  if (conversationId && agentId) {
    await completeRunFanout(runId, agentId, conversationId, 'cancelled');
  } else {
    releaseRuntimeRun(runId);
    releaseAgentSlot();
    fanoutStarted.delete(runId);
  }

  return { ok: true };
}

async function streamRunToHub(
  runId: string,
  agentId: string,
  conversationId: string,
  run: Run,
  cwd: string,
  silent: boolean,
): Promise<void> {
  const outcome = await consumeRunStream(run, (message) => {
    const wire = wireFromSdkMessage(message, runId, agentId, conversationId);
    if (wire) {
      broadcastEvent(wire);
    }
  });

  if (outcome === 'cancelled') {
    await completeRunFanout(runId, agentId, conversationId, 'cancelled', {
      workspaceRoot: cwd,
      notifyClient: !silent,
    });
    return;
  }

  if (outcome === 'auth_failed') {
    const message = formatRuntimeConnectError(new Error('[unauthenticated] Error'));
    if (silent) {
      await abandonRunFanout(runId, agentId, conversationId, cwd, message);
    } else {
      await completeRunFanout(runId, agentId, conversationId, 'failed', {
        workspaceRoot: cwd,
        errorMessage: message,
      });
    }
    return;
  }

  const { status, cancelled, authFailed } = await resolveRunTerminalStatus(run);

  if (authFailed) {
    const message = formatRuntimeConnectError(new Error('[unauthenticated] Error'));
    if (silent) {
      await abandonRunFanout(runId, agentId, conversationId, cwd, message);
    } else {
      await completeRunFanout(runId, agentId, conversationId, 'failed', {
        workspaceRoot: cwd,
        errorMessage: message,
      });
    }
    return;
  }

  await completeRunFanout(runId, agentId, conversationId, cancelled ? 'cancelled' : status, {
    workspaceRoot: cwd,
    notifyClient: !silent,
  });
}

function handleFanoutError(
  error: unknown,
  runId: string,
  agentId: string,
  conversationId: string,
  requestId: string | undefined,
  cwd: string,
  phase: 'chat.fanout' | 'chat.fanout.outer',
  silent: boolean,
): Promise<void> {
  if (isConnectCanceled(error)) {
    runtimeLogger.debug('chat.fanout.cancelled', {
      request_id: requestId,
      run_id: runId,
      agent_id: agentId,
      conversation_id: conversationId,
      phase,
    });
    return completeRunFanout(runId, agentId, conversationId, 'cancelled', {
      workspaceRoot: cwd,
      notifyClient: !silent,
    });
  }

  if (isConnectUnauthenticated(error)) {
    markRuntimeAuthUnavailable('fanout_unauthenticated');
  }

  const message = formatRuntimeConnectError(error);

  if (silent) {
    return abandonRunFanout(runId, agentId, conversationId, cwd, message);
  }

  runtimeLogger.error('chat.fanout.error', {
    request_id: requestId,
    run_id: runId,
    agent_id: agentId,
    conversation_id: conversationId,
    phase,
    ...errorFields(error),
  });
  void appendDispatchLog(
    {
      event: 'chat.fanout.error',
      request_id: requestId ?? `fanout-${runId}`,
      run_id: runId,
      agent_id: agentId,
      conversation_id: conversationId,
      cwd,
      phase,
      error_message: message,
    },
    cwd,
  );
  return completeRunFanout(runId, agentId, conversationId, 'failed', {
    workspaceRoot: cwd,
    errorMessage: message,
  });
}

export function startRunHubFanout(
  runId: string,
  agentId: string,
  conversationId: string,
  harnessWorkspaceCwd?: string,
  options?: RunHubFanoutOptions | string,
): void {
  const resolvedOptions: RunHubFanoutOptions =
    typeof options === 'string' ? { requestId: options } : (options ?? {});
  const { requestId, silent = false } = resolvedOptions;

  if (fanoutStarted.has(runId)) {
    return;
  }
  fanoutStarted.add(runId);

  const cwd = harnessWorkspaceCwd ?? workspaceCwd();

  if (!hasRuntimeSdkCredentials() || !canAttemptRuntimeSdkCall()) {
    fanoutStarted.delete(runId);
    runtimeLogger.debug('chat.fanout.skip_credentials_or_auth_gate', {
      request_id: requestId,
      run_id: runId,
      agent_id: agentId,
      conversation_id: conversationId,
      cwd,
      silent,
    });
    return;
  }

  runtimeLogger.debug('chat.fanout.started', {
    request_id: requestId,
    run_id: runId,
    agent_id: agentId,
    conversation_id: conversationId,
    cwd,
    silent,
  });

  void appendDispatchLog(
    {
      event: 'chat.fanout.started',
      request_id: requestId ?? `fanout-${runId}`,
      run_id: runId,
      agent_id: agentId,
      conversation_id: conversationId,
      cwd,
      phase: 'chat.fanout',
    },
    cwd,
  );

  void runWithWorkspaceCwdAsync(cwd, async () => {
    try {
      const entry = getRuntimeRunEntry(runId);
      let run = entry?.run;

      if (!run) {
        run = retainRuntimeRun(runId);
      }

      if (!run) {
        const { Agent } = await import('@cursor/sdk');
        run = await Agent.getRun(runId, localGetRunOptions(workspaceCwd()));
        registerRuntimeRun(runId, run, conversationId, agentId);
      }

      await streamRunToHub(runId, agentId, conversationId, run, cwd, silent);
    } catch (error) {
      await handleFanoutError(
        error,
        runId,
        agentId,
        conversationId,
        requestId,
        cwd,
        'chat.fanout',
        silent,
      );
    }
  }).catch((error) => {
    fanoutStarted.delete(runId);
    void handleFanoutError(
      error,
      runId,
      agentId,
      conversationId,
      requestId,
      cwd,
      'chat.fanout.outer',
      silent,
    ).catch(() => {
      // Last-resort guard — completeRunFanout is best-effort on terminal path.
    });
  });
}

function attachKnownRunsToHub(): void {
  if (!hasRuntimeSdkCredentials() || !canAttemptRuntimeSdkCall()) {
    return;
  }

  for (const runId of getActiveRunIds()) {
    const entry = getRuntimeRunEntry(runId);
    if (!entry || !entry.conversationId || !entry.agentId) {
      continue;
    }
    startRunHubFanout(runId, entry.agentId, entry.conversationId, undefined, { silent: true });
  }
}

async function attachIndexedRunsToHub(): Promise<void> {
  if (!hasRuntimeSdkCredentials() || !canAttemptRuntimeSdkCall()) {
    runtimeLogger.debug('chat.fanout.skip_indexed_auth_gate', {});
    return;
  }

  try {
    const index = await readAggregatedActiveRuns();
    for (const entry of index.active) {
      startRunHubFanout(entry.runId, entry.agentId, entry.conversationId, undefined, {
        silent: true,
      });
    }
  } catch {
    // Index may not exist on cold start.
  }
}

export function createRuntimeHubEventStream(signal: AbortSignal): ReadableStream<Uint8Array> {
  const HEARTBEAT_INTERVAL_MS = 15_000;

  return new ReadableStream({
    start(controller) {
      let closed = false;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      const client: HubClient = {
        enqueue: (chunk) => {
          if (!closed) {
            try {
              controller.enqueue(chunk);
            } catch {
              closed = true;
              hubClients.delete(client);
            }
          }
        },
        close: () => {
          if (!closed) {
            closed = true;
            hubClients.delete(client);
          }
        },
      };

      const close = (): void => {
        if (closed) {
          return;
        }
        closed = true;
        hubClients.delete(client);
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        try {
          controller.close();
        } catch {
          // Stream already closed.
        }
      };

      signal.addEventListener('abort', close, { once: true });
      hubClients.add(client);
      attachKnownRunsToHub();
      void attachIndexedRunsToHub().catch((error) => {
        runtimeLogger.warn('chat.fanout.attach_indexed.error', errorFields(error));
      });

      heartbeatTimer = setInterval(() => {
        if (!closed) {
          client.enqueue(encodeSseHeartbeat());
        }
      }, HEARTBEAT_INTERVAL_MS);
    },
    cancel() {
      signal.abort();
    },
  });
}

export function toHubWireEvent(
  event: RuntimeStreamWireEvent,
  conversationId: string,
): RuntimeHubWireEvent {
  return {
    ...event,
    conversation_id: conversationId,
  };
}

export function encodeRuntimeSseData(event: RuntimeStreamWireEvent): Uint8Array {
  return encodeSseData(event);
}

export function encodeRuntimeSseHeartbeat(): Uint8Array {
  return encodeSseHeartbeat();
}
