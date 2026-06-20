import {
  buildExecutionViewModel,
  isActiveExecution,
  runtimeEventToWire,
  SSE_RUNTIME_EVENT_TYPES,
  type ExecutionEventWire,
} from './execution-events';
import { getExecutionDetail } from './harness-reader';

const POLL_INTERVAL_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 15_000;

function encodeSseData(event: ExecutionEventWire): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

function encodeSseHeartbeat(): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(': heartbeat\n\n');
}

export function createExecutionEventStream(
  executionId: string,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const emittedIds = new Set<string>();

  let closeStream: (() => void) | null = null;

  return new ReadableStream({
    start(controller) {
      let pollTimer: ReturnType<typeof setInterval> | null = null;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      let closed = false;

      const close = (): void => {
        if (closed) {
          return;
        }
        closed = true;
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
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

      closeStream = close;

      const poll = async (): Promise<void> => {
        if (closed) {
          return;
        }

        try {
          const detail = await getExecutionDetail(executionId);
          if (!detail) {
            close();
            return;
          }

          const viewModel = buildExecutionViewModel(detail);

          for (const event of viewModel.events) {
            if (!SSE_RUNTIME_EVENT_TYPES.has(event.type) || emittedIds.has(event.id)) {
              continue;
            }
            emittedIds.add(event.id);
            controller.enqueue(encodeSseData(runtimeEventToWire(event)));
          }

          if (!isActiveExecution(viewModel.status)) {
            close();
          }
        } catch {
          close();
        }
      };

      signal.addEventListener('abort', close, { once: true });

      void poll().then(() => {
        if (closed) {
          return;
        }

        heartbeatTimer = setInterval(() => {
          if (!closed) {
            controller.enqueue(encodeSseHeartbeat());
          }
        }, HEARTBEAT_INTERVAL_MS);

        pollTimer = setInterval(() => {
          void poll();
        }, POLL_INTERVAL_MS);
      });
    },
    cancel() {
      closeStream?.();
    },
  });
}
