import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { i as isReaderFontSize, a as isReaderLineHeight, b as isReaderSpacing } from './reader-preferences_nY-iUW51.mjs';
import { r as readReaderPreferences, p as patchReaderPreferences } from './ui-reader-preferences_BNZR_SIy.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
const GET = async ({ request, url }) => {
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const preferences = await readReaderPreferences(workspaceRoot);
    return jsonOk(preferences);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load reader preferences";
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
  if (body.fontSize !== void 0 && !isReaderFontSize(body.fontSize)) {
    return jsonError("fontSize must be one of: sm, base, lg, xl", 400);
  }
  if (body.lineHeight !== void 0 && !isReaderLineHeight(body.lineHeight)) {
    return jsonError("lineHeight must be one of: tight, normal, relaxed, loose", 400);
  }
  if (body.spacing !== void 0 && !isReaderSpacing(body.spacing)) {
    return jsonError("spacing must be one of: compact, comfortable, airy", 400);
  }
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const preferences = await patchReaderPreferences({
      fontSize: isReaderFontSize(body.fontSize) ? body.fontSize : void 0,
      lineHeight: isReaderLineHeight(body.lineHeight) ? body.lineHeight : void 0,
      spacing: isReaderSpacing(body.spacing) ? body.spacing : void 0
    }, workspaceRoot);
    return jsonOk(preferences);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update reader preferences";
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
