import type { Run, SDKMessage } from '@cursor/sdk';

import { joinAssistantTextBlocks } from './assistant-text';
import { appendDispatchLog } from './runtime-dispatch-log';
import { clearOpenUIAssistantAccumulator, wireOpenUIAssistantMessage } from './openui-wire';
import {
  formatRuntimeConnectError,
  isConnectCanceled,
  isConnectUnauthenticated,
  cancelRunIgnoringConnectAbort,
} from './runtime-connect-errors';
import { installRuntimeProcessGuard } from './runtime-process-guard';
import { appendRunInterrupted, type RunInterruptReason } from './runtime-run-interrupt';
import { readLiveActiveRuns } from './runtime-active-runs';
import {
  loadRunSessionLifecyclePolicy,
  shouldAutoAttachIndexedRuns,
} from './runtime-run-session-policy';
import { appendRunTerminal, findActiveRunEntry } from './runtime-run-registry';
import { isFailedRunStatus } from './runtime-run-failure';
import { errorFields, runtimeLogger } from './runtime-logger';
import { hasRuntimeSdkCredentials, localGetRunOptions } from './runtime-sdk-local';
import {
  canAttemptRuntimeSdkCall,
  markRuntimeAuthUnavailable,
} from './runtime-sdk-auth-gate';
import { consumeRunStream, resolveRunTerminalStatus } from './runtime-sdk-stream';
import { reconcileRuntimeCredentials } from './runtime-credentials-reconcile';
import { invalidateSdkProbeCache } from './runtime-sdk-probe';
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
import { clearRunContext, getRunContext } from './runtime-run-context';
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
        call_id: message.call_id,
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

  if (message.type === 'status' && message.status === 'ERROR') {
    return {
      type: 'error',
      run_id: runId,
      agent_id: agentId,
      conversation_id: conversationId,
      timestamp,
      payload: {
        message: message.message?.trim() || 'Runtime run failed',
      },
    };
  }

  if (message.type === 'usage') {
    return {
      type: 'context.usage',
      run_id: runId,
      agent_id: agentId,
      conversation_id: conversationId,
      timestamp,
      payload: {
        usage: message.usage,
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

export function broadcastBrowserSessionReady(input: {
  conversationId: string;
  sessionId: string;
  url: string;
  interactive?: boolean;
  controlMode?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  renderMode?: string;
}): void {
  broadcastEvent({
    type: 'browser.session.ready',
    run_id: '',
    agent_id: '',
    conversation_id: input.conversationId,
    timestamp: new Date().toISOString(),
    payload: {
      sessionId: input.sessionId,
      url: input.url,
      interactive: Boolean(input.interactive),
      controlMode: input.controlMode ?? 'agent',
      viewportWidth: input.viewportWidth ?? 1280,
      viewportHeight: input.viewportHeight ?? 720,
      renderMode: input.renderMode ?? 'screencast',
    },
  });
}

export function broadcastBrowserUrlChanged(input: {
  conversationId: string;
  sessionId: string;
  url: string;
}): void {
  broadcastEvent({
    type: 'browser.url.changed',
    run_id: '',
    agent_id: '',
    conversation_id: input.conversationId,
    timestamp: new Date().toISOString(),
    payload: {
      sessionId: input.sessionId,
      url: input.url,
    },
  });
}

export function broadcastBrowserSessionClosed(input: {
  conversationId: string;
  sessionId: string;
}): void {
  broadcastEvent({
    type: 'browser.session.closed',
    run_id: '',
    agent_id: '',
    conversation_id: input.conversationId,
    timestamp: new Date().toISOString(),
    payload: {
      sessionId: input.sessionId,
    },
  });
}

export function broadcastComputerUsePreviewReady(input: {
  conversationId: string;
  sessionId: string;
}): void {
  broadcastEvent({
    type: 'computer_use.preview.ready',
    run_id: '',
    agent_id: '',
    conversation_id: input.conversationId,
    timestamp: new Date().toISOString(),
    payload: {
      sessionId: input.sessionId,
    },
  });
}

export function broadcastRunInterrupted(input: {
  runId: string;
  agentId: string;
  conversationId: string;
  reason: RunInterruptReason | string;
  message?: string;
}): void {
  broadcastEvent({
    type: 'run.interrupted',
    run_id: input.runId,
    agent_id: input.agentId,
    conversation_id: input.conversationId,
    timestamp: new Date().toISOString(),
    payload: {
      reason: input.reason,
      message: input.message ?? `Run interrupted (${input.reason})`,
      resumable: true,
    },
  });
}

export function broadcastRunRecoveredComplete(input: {
  runId: string;
  agentId: string;
  conversationId: string;
  status: string;
}): void {
  broadcastEvent({
    type: 'run_complete',
    run_id: input.runId,
    agent_id: input.agentId,
    conversation_id: input.conversationId,
    timestamp: new Date().toISOString(),
    payload: {
      status: input.status,
      recovered: true,
    },
  });
}

interface CompleteRunFanoutOptions {
  workspaceRoot?: string;
  notifyClient?: boolean;
  errorMessage?: string;
  clearAgent?: boolean;
}

function teardownRunFanout(runId: string): void {
  fanoutStarted.delete(runId);
  clearRunContext(runId);
  clearOpenUIAssistantAccumulator(runId);
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
        payload: {
          message: errorMessage,
          ...(options.clearAgent ? { clear_agent: true } : {}),
        },
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
  } else if (!isFailedRunStatus(status) && status.trim().toLowerCase() !== 'cancelled') {
    broadcastRunRecoveredComplete({
      runId,
      agentId,
      conversationId,
      status,
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
    broadcastRunInterrupted({
      runId,
      agentId,
      conversationId,
      reason: 'stale_reattach',
      message: 'Background run reattach abandoned',
    });

    try {
      await appendRunInterrupted({
        runId,
        reason: 'stale_reattach',
        message: 'Background run reattach abandoned',
        resumable: true,
        workspaceRoot: resolvedWorkspaceRoot,
      });
    } catch {
      // Registry append is best-effort on terminal path.
    }
  }

  releaseRuntimeRun(runId);
  releaseAgentSlot();
  teardownRunFanout(runId);
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

  broadcastRunInterrupted({
    runId,
    agentId,
    conversationId,
    reason: 'stale_reattach',
    message: reason,
  });

  try {
    await appendRunInterrupted({
      runId,
      reason: 'stale_reattach',
      message: reason,
      resumable: true,
      workspaceRoot: cwd,
    });
  } catch {
    // Registry append is best-effort.
  }

  releaseRuntimeRun(runId);
  releaseAgentSlot();
  teardownRunFanout(runId);
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
    await cancelRunIgnoringConnectAbort(run);
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
    teardownRunFanout(runId);
  }

  return { ok: true };
}

async function finalizeStreamedRunFanout(
  runId: string,
  agentId: string,
  conversationId: string,
  cwd: string,
  silent: boolean,
  requestId?: string,
): Promise<void> {
  const entry = getRuntimeRunEntry(runId);
  const run = entry?.run;
  if (!run) {
    const message = 'Run stream ended without a registered runtime handle';
    runtimeLogger.error('chat.fanout.run_missing', {
      request_id: requestId,
      run_id: runId,
      agent_id: agentId,
      conversation_id: conversationId,
      error_message: message,
    });
    if (silent) {
      await abandonRunFanout(runId, agentId, conversationId, cwd, message);
      return;
    }
    await completeRunFanout(runId, agentId, conversationId, 'failed', {
      workspaceRoot: cwd,
      errorMessage: message,
    });
    return;
  }

  const terminal = await resolveRunTerminalStatus(run, { workspaceCwd: cwd });

  if (terminal.authFailed) {
    markRuntimeAuthUnavailable('fanout_run_auth_failed');
    invalidateSdkProbeCache(cwd);
    void reconcileRuntimeCredentials();
  }

  if (terminal.failed) {
    const message = terminal.errorMessage ?? 'Runtime run failed';
    runtimeLogger.warn('chat.fanout.run_failed', {
      request_id: requestId,
      run_id: runId,
      agent_id: agentId,
      conversation_id: conversationId,
      status: terminal.status,
      auth_failed: terminal.authFailed,
      error_message: message,
    });
    if (silent) {
      await abandonRunFanout(runId, agentId, conversationId, cwd, message);
      return;
    }
    await completeRunFanout(runId, agentId, conversationId, 'failed', {
      workspaceRoot: cwd,
      errorMessage: message,
      clearAgent: terminal.authFailed,
    });
    return;
  }

  await completeRunFanout(runId, agentId, conversationId, terminal.cancelled ? 'cancelled' : terminal.status, {
    workspaceRoot: cwd,
    notifyClient: !silent,
  });
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
    const runContext = getRunContext(runId);
    const wire =
      runContext?.wireMode === 'rich' && message.type === 'assistant'
        ? wireOpenUIAssistantMessage(message, runId, agentId, conversationId, runContext.surfaceId)
        : wireFromSdkMessage(message, runId, agentId, conversationId);
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
    markRuntimeAuthUnavailable('fanout_stream_auth_failed');
    invalidateSdkProbeCache(cwd);
    void reconcileRuntimeCredentials();
    const message = formatRuntimeConnectError(new Error('[unauthenticated] Error'));
    if (silent) {
      await abandonRunFanout(runId, agentId, conversationId, cwd, message);
    } else {
      await completeRunFanout(runId, agentId, conversationId, 'failed', {
        workspaceRoot: cwd,
        errorMessage: message,
        clearAgent: true,
      });
    }
    return;
  }

  await finalizeStreamedRunFanout(runId, agentId, conversationId, cwd, silent);
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
    teardownRunFanout(runId);
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
        run = await Agent.getRun(runId, await localGetRunOptions(workspaceCwd()));
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
    teardownRunFanout(runId);
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

  const policy = await loadRunSessionLifecyclePolicy();
  if (!shouldAutoAttachIndexedRuns(policy)) {
    runtimeLogger.debug('chat.fanout.skip_indexed_session_boundary', {
      indexed_at_process_start: policy.indexedAtProcessStart,
    });
    return;
  }

  try {
    const index = await readLiveActiveRuns();
    for (const entry of index.active) {
      const located = await findActiveRunEntry(entry.runId);
      startRunHubFanout(
        entry.runId,
        entry.agentId,
        entry.conversationId,
        located?.workspaceRoot,
        { silent: true },
      );
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
