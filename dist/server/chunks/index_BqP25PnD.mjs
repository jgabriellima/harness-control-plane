import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { l as listWorkflowSummaries } from './workflows_BmvYpYlp.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const GET = async ({ request, url }) => {
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const workflows = await listWorkflowSummaries(workspaceRoot);
    return jsonOk({ workflows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list workflows";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
