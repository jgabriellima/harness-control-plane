import { j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { b as buildExecutionViewModel, S as SSE_RUNTIME_EVENT_TYPES, r as runtimeEventToWire, i as isActiveExecution } from './execution-events_C-qnIkOA.mjs';
import { g as getExecutionDetail } from './harness-reader_xurzrbMU.mjs';

const POLL_INTERVAL_MS = 1e3;
const HEARTBEAT_INTERVAL_MS = 15e3;
function encodeSseData(event) {
  const encoder = new TextEncoder();
  return encoder.encode(`data: ${JSON.stringify(event)}

`);
}
function encodeSseHeartbeat() {
  const encoder = new TextEncoder();
  return encoder.encode(": heartbeat\n\n");
}
function createExecutionEventStream(executionId, signal) {
  const emittedIds = /* @__PURE__ */ new Set();
  let closeStream = null;
  return new ReadableStream({
    start(controller) {
      let pollTimer = null;
      let heartbeatTimer = null;
      let closed = false;
      const close = () => {
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
        }
      };
      closeStream = close;
      const poll = async () => {
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
      signal.addEventListener("abort", close, { once: true });
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
    }
  });
}

const GET = async ({ params, request }) => {
  const executionId = params.id;
  if (!executionId) {
    return jsonError("Execution id is required", 400);
  }
  const detail = await getExecutionDetail(executionId);
  if (!detail) {
    return jsonError("Execution not found", 404);
  }
  const stream = createExecutionEventStream(executionId, request.signal);
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
