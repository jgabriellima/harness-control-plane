import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { i as isRichUiMode } from './presentation-types_CtohLCX-.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';
import { r as readWorkspacePresentation, p as patchWorkspacePresentation } from './workspace-presentation_jinFlVUJ.mjs';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
const GET = async ({ request, url }) => {
  try {
    const projectId = url.searchParams.get("project_id")?.trim();
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const manifest = await readWorkspacePresentation(workspaceRoot);
    return jsonOk(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load presentation settings";
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
  if (!isRecord(body)) {
    return jsonError("Request body must be a JSON object", 400);
  }
  const richUi = body.richUi ?? body.rich_ui;
  if (richUi !== void 0 && !isRichUiMode(richUi)) {
    return jsonError("richUi must be one of: off, adaptive, always", 400);
  }
  try {
    const projectId = url.searchParams.get("project_id")?.trim();
    const { workspaceRoot, activeProjectId } = await resolveRequestWorkspace(request, projectId);
    const manifest = await patchWorkspacePresentation(workspaceRoot, {
      richUi: isRichUiMode(richUi) ? richUi : void 0
    });
    return jsonOk({
      ...manifest,
      project_id: activeProjectId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update presentation settings";
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
