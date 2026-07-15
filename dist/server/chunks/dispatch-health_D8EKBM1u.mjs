import { a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { p as probeSdkDispatchHealth } from './runtime-sdk-probe_CMRaDJPh.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const GET = async ({ request, url }) => {
  const projectId = url.searchParams.get("project_id")?.trim() || void 0;
  const force = url.searchParams.get("force") === "1";
  const execution = url.searchParams.get("execution") === "1";
  const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
  const health = await probeSdkDispatchHealth({
    cacheKey: workspaceRoot,
    force,
    workspaceCwd: workspaceRoot,
    probeLocalExecution: execution
  });
  return jsonOk(health);
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
