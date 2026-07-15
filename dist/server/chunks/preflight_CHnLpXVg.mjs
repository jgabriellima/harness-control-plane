import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { r as runSandboxPreflight } from './runtime-computer-use-sandbox-preflight_Dtw4JMaM.mjs';
import { isComputerUseContractEnabled } from './runtime-computer-use-preferences_NdHwuD2F.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const GET = async ({ request, url }) => {
  const localParam = url.searchParams.get("local");
  const local = localParam === null ? true : localParam !== "0" && localParam !== "false";
  try {
    const projectId = url.searchParams.get("project_id")?.trim() || void 0;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const contractEnabled = await isComputerUseContractEnabled(workspaceRoot);
    const preflight = await runSandboxPreflight({ local });
    return jsonOk({
      contract_enabled: contractEnabled,
      local,
      ready: contractEnabled && preflight.ok,
      preflight
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sandbox pre-flight probe failed";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
