import { g as getArtifactDetail } from './artifacts_IHPU-dPk.mjs';
import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const GET = async ({ params, request, url }) => {
  const artifactId = params.id;
  if (!artifactId) {
    return jsonError("Artifact id is required", 400);
  }
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const artifact = await getArtifactDetail(artifactId, workspaceRoot);
    if (!artifact) {
      return jsonError("Artifact not found", 404);
    }
    return jsonOk(artifact);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load artifact";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
