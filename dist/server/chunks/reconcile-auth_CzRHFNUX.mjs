import { a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { r as reconcileRuntimeCredentials } from './runtime-credentials-reconcile_CrWdw52B.mjs';
import { b as invalidateSdkProbeCache, p as probeSdkDispatchHealth, f as clearRuntimeAuthGate } from './runtime-sdk-probe_CMRaDJPh.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const POST = async ({ request, url }) => {
  const projectId = url.searchParams.get("project_id")?.trim() || void 0;
  const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
  await reconcileRuntimeCredentials();
  clearRuntimeAuthGate();
  invalidateSdkProbeCache(workspaceRoot);
  const health = await probeSdkDispatchHealth({
    cacheKey: workspaceRoot,
    force: true,
    workspaceCwd: workspaceRoot,
    probeLocalExecution: true
  });
  return jsonOk({
    reconciled: true,
    health
  });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
