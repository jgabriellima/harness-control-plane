import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { l as listHarnessCommands } from './harness-commands_DUJV9FFj.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const GET = async ({ request, url }) => {
  try {
    const projectId = url.searchParams.get("project_id")?.trim() || void 0;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const commands = await listHarnessCommands(workspaceRoot);
    return jsonOk({ commands });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load harness commands";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
