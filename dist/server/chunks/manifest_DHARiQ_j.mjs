import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { l as loadCredentialManifest } from './credential-manifest_D1slBkJK.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const GET = async ({ request, url }) => {
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const manifest = await loadCredentialManifest(workspaceRoot);
    if (!manifest) {
      return jsonOk({
        generated_at: null,
        source: "missing",
        secrets: []
      });
    }
    return jsonOk(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load credential manifest";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
