import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { n as normalizeProjectId, a as resolveSandboxManifestForProject, r as runSandboxActionScript } from './runtime-computer-use-sandbox-bridge_AD0l_YFn.mjs';
import { isComputerUseContractEnabled } from './runtime-computer-use-preferences_NdHwuD2F.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
const POST = async ({ request }) => {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON", 400);
  }
  if (!isRecord(body)) {
    return jsonError("Request body must be a JSON object", 400);
  }
  const actionRaw = typeof body.action === "string" ? body.action.trim() : "";
  const action = actionRaw === "open_url" || actionRaw === "open-url" ? "open-url" : actionRaw === "screenshot" ? "screenshot" : actionRaw === "shell" ? "shell" : null;
  if (!action) {
    return jsonError("action must be open_url, screenshot, or shell", 400);
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const command = typeof body.command === "string" ? body.command : "";
  const timeout = typeof body.timeout === "number" ? body.timeout : void 0;
  const projectIdParam = typeof body.project_id === "string" ? normalizeProjectId(body.project_id) : "default";
  if (action === "open-url" && !url) {
    return jsonError("url is required for open_url", 400);
  }
  if (action === "shell" && !command.trim()) {
    return jsonError("command is required for shell", 400);
  }
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectIdParam);
    const contractEnabled = await isComputerUseContractEnabled(workspaceRoot);
    if (!contractEnabled) {
      return jsonError("Computer use contract is not enabled for this workspace", 403);
    }
    const manifest = await resolveSandboxManifestForProject(projectIdParam, workspaceRoot);
    if (!manifest || manifest.phase !== "ready" || !manifest.sandboxName) {
      return jsonError(
        "Sandbox is not ready — wait for computer-use-sandbox.json phase=ready in the active project workspace",
        409
      );
    }
    const result = await runSandboxActionScript({
      action,
      sandboxName: manifest.sandboxName,
      url: action === "open-url" ? url : void 0,
      command: action === "shell" ? command : void 0,
      timeout,
      workspaceRoot,
      local: true
    });
    const ok = result.status === "ok";
    if (ok) {
      return jsonOk({ ok: true, action, sandbox: manifest.sandboxName, result });
    }
    return jsonError(
      typeof result.error === "string" ? result.error : "Sandbox action failed",
      500,
      { detail: JSON.stringify({ action, sandbox: manifest.sandboxName, result }) }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sandbox action failed";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
