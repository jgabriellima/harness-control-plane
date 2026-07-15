import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { r as resolveWorkspaceHarnessBinding } from './workspace-harness-binding_DtkiVVW4.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';
import { a as COMPUTER_USE_PERMISSION_ACTIVE_MESSAGE, C as COMPUTER_USE_PERMISSION_STEPS, b as COMPUTER_USE_PERMISSION_DIALOG_HINT } from './runtime-computer-use-copy_DmXbiJtE.mjs';
import { b as preparePermissionGrant, o as openMacPermissionSettings, t as tryCompleteComputerUseSetup, p as probeComputerUseSetup, s as startPermissionsGrantDetached } from './runtime-computer-use-setup_B_3mC38S.mjs';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
const POST = async ({ request, url }) => {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const openSettings = isRecord(body) && body.open_settings === true;
  const grantOnly = isRecord(body) && body.grant_only === true;
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
    const root = binding.workspaceRoot;
    await preparePermissionGrant();
    if (openSettings) {
      await openMacPermissionSettings();
      const completed2 = await tryCompleteComputerUseSetup(root);
      const setup2 = await probeComputerUseSetup(root);
      return jsonOk({
        setup: setup2,
        activated: completed2.activated,
        opened_settings: true,
        restarted: completed2.restarted,
        message: completed2.activated ? COMPUTER_USE_PERMISSION_ACTIVE_MESSAGE : `System Settings opened — ${COMPUTER_USE_PERMISSION_STEPS}`
      });
    }
    if (grantOnly) {
      startPermissionsGrantDetached();
      const completed2 = await tryCompleteComputerUseSetup(root);
      const setup2 = await probeComputerUseSetup(root);
      return jsonOk({
        setup: setup2,
        activated: completed2.activated,
        grant_started: true,
        restarted: completed2.restarted,
        message: completed2.activated ? COMPUTER_USE_PERMISSION_ACTIVE_MESSAGE : COMPUTER_USE_PERMISSION_STEPS
      });
    }
    startPermissionsGrantDetached();
    const completed = await tryCompleteComputerUseSetup(root);
    const setup = await probeComputerUseSetup(root);
    return jsonOk({
      setup,
      activated: completed.activated,
      grant_started: true,
      restarted: completed.restarted,
      message: completed.activated ? COMPUTER_USE_PERMISSION_ACTIVE_MESSAGE : COMPUTER_USE_PERMISSION_DIALOG_HINT
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to grant permissions";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
