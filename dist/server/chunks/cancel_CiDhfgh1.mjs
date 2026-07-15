import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { j as cancelRuntimeRun } from './runtime-hub-stream_CkfCSBM_.mjs';

const POST = async ({ params }) => {
  const runId = params.runId?.trim();
  if (!runId) {
    return jsonError("runId is required", 400);
  }
  const result = await cancelRuntimeRun(runId);
  if (!result.ok) {
    return jsonError(result.message ?? "Cancel failed", 409);
  }
  return jsonOk({ run_id: runId, status: "cancelled" });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
