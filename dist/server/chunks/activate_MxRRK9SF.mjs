import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { r as resolveWorkspaceHarnessBinding } from './workspace-harness-binding_DtkiVVW4.mjs';
import { a as activateComputerUse } from './runtime-computer-use-setup_B_3mC38S.mjs';
import { saveComputerUsePreferences } from './runtime-computer-use-preferences_NdHwuD2F.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const POST = async ({ request, url }) => {
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
    const result = await activateComputerUse(binding.workspaceRoot);
    return jsonOk(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to activate computer use";
    return jsonError(message, 500);
  }
};
const DELETE = async ({ request, url }) => {
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
    const preferences = await saveComputerUsePreferences(
      { hostControlEnabled: false, allowForegroundCursor: false },
      binding.workspaceRoot
    );
    return jsonOk({ preferences, activated: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to deactivate computer use";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  DELETE,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
