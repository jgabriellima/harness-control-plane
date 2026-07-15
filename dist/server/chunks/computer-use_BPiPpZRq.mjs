import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { r as resolveWorkspaceHarnessBinding } from './workspace-harness-binding_DtkiVVW4.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';
import { loadComputerUseStatus, saveComputerUsePreferences } from './runtime-computer-use-preferences_NdHwuD2F.mjs';
import { t as tryCompleteComputerUseSetup } from './runtime-computer-use-setup_B_3mC38S.mjs';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function parsePatch(body) {
  if (!isRecord(body)) {
    return {};
  }
  const patch = {};
  if (typeof body.hostControlEnabled === "boolean") {
    patch.hostControlEnabled = body.hostControlEnabled;
  }
  if (typeof body.allowForegroundCursor === "boolean") {
    patch.allowForegroundCursor = body.allowForegroundCursor;
  }
  return patch;
}
const GET = async ({ request, url }) => {
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
    const root = binding.workspaceRoot;
    let status = await loadComputerUseStatus(root);
    if (!status.active && status.setup.phase === "permissions") {
      await tryCompleteComputerUseSetup(root);
      status = await loadComputerUseStatus(root);
    }
    return jsonOk(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load computer-use settings";
    return jsonError(message, 500);
  }
};
const PATCH = async ({ request, url }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON", 400);
  }
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
    const patch = parsePatch(body);
    if (patch.hostControlEnabled === void 0 && patch.allowForegroundCursor === void 0) {
      return jsonError("At least one of hostControlEnabled or allowForegroundCursor is required", 400);
    }
    if (patch.allowForegroundCursor === true && patch.hostControlEnabled === false) {
      return jsonError("allowForegroundCursor requires hostControlEnabled", 400);
    }
    const preferences = await saveComputerUsePreferences(patch, binding.workspaceRoot);
    const status = await loadComputerUseStatus(binding.workspaceRoot);
    return jsonOk({ ...status, preferences });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save computer-use settings";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  PATCH
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
