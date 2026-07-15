import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { g as getExecutionDetail } from './harness-reader_xurzrbMU.mjs';

const GET = async ({ params }) => {
  const executionId = params.id;
  if (!executionId) {
    return jsonError("Execution id is required", 400);
  }
  try {
    const execution = await getExecutionDetail(executionId);
    if (!execution) {
      return jsonError("Execution not found", 404);
    }
    return jsonOk(execution);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load execution";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
