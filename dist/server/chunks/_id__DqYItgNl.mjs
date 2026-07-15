import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { g as getWorkflowDetail } from './workflows_BmvYpYlp.mjs';

const GET = async ({ params }) => {
  const workflowId = params.id;
  if (!workflowId) {
    return jsonError("Workflow id is required", 400);
  }
  try {
    const workflow = await getWorkflowDetail(workflowId);
    if (!workflow) {
      return jsonError("Workflow not found", 404);
    }
    return jsonOk(workflow);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load workflow";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
