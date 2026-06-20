import type { Run, SDKMessage } from '@cursor/sdk';

import { appendRunTerminal, readRunsIndex } from './runtime-run-registry';
import {
  getActiveRunIds,
  getRuntimeRunEntry,
  registerRuntimeRun,
  releaseAgentSlot,
  releaseRuntimeRun,
  retainRuntimeRun,
  workspaceCwd,
} from './runtime-sessions';
import type { RuntimeHubWireEvent } from './runtime-hub-types';

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
    const textBlocks = message.message.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('');

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

async function completeRunFanout(
  runId: string,
  agentId: string,
  conversationId: string,
  status: string,
  errorMessage?: string,
): Promise<void> {
  if (errorMessage) {
    broadcastEvent({
      type: 'error',
      run_id: runId,
      agent_id: agentId,
      conversation_id: conversationId,
      timestamp: new Date().toISOString(),
      payload: { message: errorMessage },
    });

    try {
      await appendRunTerminal({
        runId,
        event: 'run.failed',
        message: errorMessage,
      });
    } catch {
      // Registry append is best-effort on terminal path.
    }
  } else {
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
      });
    } catch {
      // Registry append is best-effort on terminal path.
    }
  }

  releaseRuntimeRun(runId);
  releaseAgentSlot();
  fanoutStarted.delete(runId);
}

async function streamRunToHub(
  runId: string,
  agentId: string,
  conversationId: string,
  run: Run,
): Promise<void> {
  for await (const message of run.stream()) {
    const wire = wireFromSdkMessage(message, runId, agentId, conversationId);
    if (wire) {
      broadcastEvent(wire);
    }
  }

  let status = run.status;
  if (run.supports('wait')) {
    const result = await run.wait();
    status = result.status;
  }

  await completeRunFanout(runId, agentId, conversationId, status);
}

export function startRunHubFanout(runId: string, agentId: string, conversationId: string): void {
  if (fanoutStarted.has(runId)) {
    return;
  }
  fanoutStarted.add(runId);

  void (async () => {
    try {
      const entry = getRuntimeRunEntry(runId);
      let run = entry?.run;

      if (!run) {
        run = retainRuntimeRun(runId);
      }

      if (!run) {
        const apiKey = process.env.CURSOR_API_KEY?.trim();
        if (!apiKey) {
          throw new Error('CURSOR_API_KEY is required');
        }
        const { Agent } = await import('@cursor/sdk');
        run = await Agent.getRun(runId, {
          runtime: 'local',
          cwd: workspaceCwd(),
        });
        registerRuntimeRun(runId, run, conversationId, agentId);
      }

      await streamRunToHub(runId, agentId, conversationId, run);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Runtime stream failed';
      await completeRunFanout(runId, agentId, conversationId, 'failed', message);
    }
  })();
}

function attachKnownRunsToHub(): void {
  for (const runId of getActiveRunIds()) {
    const entry = getRuntimeRunEntry(runId);
    if (!entry || !entry.conversationId || !entry.agentId) {
      continue;
    }
    startRunHubFanout(runId, entry.agentId, entry.conversationId);
  }
}

async function attachIndexedRunsToHub(): Promise<void> {
  try {
    const index = await readRunsIndex();
    for (const entry of index.active) {
      startRunHubFanout(entry.runId, entry.agentId, entry.conversationId);
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
      void attachIndexedRunsToHub();

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
