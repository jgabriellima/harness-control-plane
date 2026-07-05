import type { SDKMessage } from '@cursor/sdk';

import { formatRuntimeConnectError, isConnectCanceled } from './runtime-connect-errors';
import {
  encodeRuntimeSseData,
  encodeRuntimeSseHeartbeat,
  wireFromSdkMessage,
  type RuntimeStreamWireEvent,
} from './runtime-hub-stream';
import { localGetRunOptions } from './runtime-sdk-local';
import { consumeRunStream, resolveRunTerminalStatus } from './runtime-sdk-stream';
import {
  releaseAgentSlot,
  releaseRuntimeRun,
  retainRuntimeRun,
  workspaceCwd,
} from './runtime-sessions';

export type { RuntimeStreamWireEvent } from './runtime-hub-stream';

function wireFromSdkMessageSingleSession(
  message: SDKMessage,
  runId: string,
  agentId: string,
): RuntimeStreamWireEvent | null {
  const hubWire = wireFromSdkMessage(message, runId, agentId, '');
  if (!hubWire) {
    return null;
  }
  const { conversation_id: _ignored, ...wire } = hubWire;
  return wire;
}

export function createRuntimeEventStream(
  runId: string,
  agentId: string,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const HEARTBEAT_INTERVAL_MS = 15_000;

  return new ReadableStream({
    async start(controller) {
      let closed = false;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      const close = (): void => {
        if (closed) {
          return;
        }
        closed = true;
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

      heartbeatTimer = setInterval(() => {
        if (!closed) {
          controller.enqueue(encodeRuntimeSseHeartbeat());
        }
      }, HEARTBEAT_INTERVAL_MS);

      let retained = false;

      try {
        localGetRunOptions(workspaceCwd());

        let run = retainRuntimeRun(runId);
        retained = Boolean(run);

        if (!run) {
          const { Agent } = await import('@cursor/sdk');
          run = await Agent.getRun(runId, localGetRunOptions(workspaceCwd()));
        }

        const outcome = await consumeRunStream(run, (message) => {
          if (closed) {
            return;
          }

          const wire = wireFromSdkMessageSingleSession(message, runId, agentId);
          if (wire) {
            controller.enqueue(encodeRuntimeSseData(wire));
          }
        });

        if (closed || outcome === 'cancelled' || outcome === 'auth_failed') {
          if (outcome === 'auth_failed' && !closed) {
            controller.enqueue(
              encodeRuntimeSseData({
                type: 'error',
                run_id: runId,
                agent_id: agentId,
                timestamp: new Date().toISOString(),
                payload: {
                  message: formatRuntimeConnectError(new Error('[unauthenticated] Error')),
                },
              }),
            );
          }
          return;
        }

        const { status, cancelled, authFailed } = await resolveRunTerminalStatus(run);
        if (closed || authFailed) {
          if (authFailed && !closed) {
            controller.enqueue(
              encodeRuntimeSseData({
                type: 'error',
                run_id: runId,
                agent_id: agentId,
                timestamp: new Date().toISOString(),
                payload: {
                  message: formatRuntimeConnectError(new Error('[unauthenticated] Error')),
                },
              }),
            );
          }
          return;
        }

        controller.enqueue(
          encodeRuntimeSseData({
            type: 'run_complete',
            run_id: runId,
            agent_id: agentId,
            timestamp: new Date().toISOString(),
            payload: { status: cancelled ? 'cancelled' : status },
          }),
        );
      } catch (error) {
        if (closed || isConnectCanceled(error)) {
          return;
        }

        const message = formatRuntimeConnectError(error);
        controller.enqueue(
          encodeRuntimeSseData({
            type: 'error',
            run_id: runId,
            agent_id: agentId,
            timestamp: new Date().toISOString(),
            payload: { message },
          }),
        );
      } finally {
        if (retained) {
          releaseRuntimeRun(runId);
        }
        releaseAgentSlot();
        close();
      }
    },
    cancel() {
      signal.abort();
    },
  });
}
