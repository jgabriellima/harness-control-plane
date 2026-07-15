import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { n as normalizeProjectId, a as resolveSandboxManifestForProject } from './runtime-computer-use-sandbox-bridge_AD0l_YFn.mjs';
import { isComputerUseContractEnabled } from './runtime-computer-use-preferences_NdHwuD2F.mjs';
import { r as runSandboxPreflight } from './runtime-computer-use-sandbox-preflight_Dtw4JMaM.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const GET = async ({ request, url }) => {
  try {
    const projectId = normalizeProjectId(url.searchParams.get("project_id") ?? void 0);
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const contractEnabled = await isComputerUseContractEnabled(workspaceRoot);
    const manifest = await resolveSandboxManifestForProject(projectId, workspaceRoot);
    const preflight = await runSandboxPreflight({ local: true });
    return jsonOk({
      contract_enabled: contractEnabled,
      ready: Boolean(manifest && manifest.phase === "ready" && manifest.sandboxName),
      manifest,
      preflight,
      workspace_root: workspaceRoot
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sandbox status probe failed";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
