import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { r as readAggregatedActiveRuns, m as interruptAllActiveRuns } from './runtime-sessions_Qp0oFuny.mjs';
import { d as broadcastRunInterrupted } from './runtime-hub-stream_CkfCSBM_.mjs';

const POST = async ({ request }) => {
  let reason = "app_close";
  try {
    const body = await request.json();
    if (typeof body.reason === "string" && body.reason.trim().length > 0) {
      reason = body.reason.trim();
    }
  } catch {
  }
  const index = await readAggregatedActiveRuns();
  for (const entry of index.active) {
    broadcastRunInterrupted({
      runId: entry.runId,
      agentId: entry.agentId,
      conversationId: entry.conversationId,
      reason,
      message: `Run interrupted (${reason})`
    });
  }
  try {
    const interrupted = await interruptAllActiveRuns(reason);
    return jsonOk({ ok: true, interrupted, reason });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to interrupt active runs";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
