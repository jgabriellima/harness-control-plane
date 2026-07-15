import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { r as resolveWorkspaceHarnessBinding } from './workspace-harness-binding_DtkiVVW4.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const DEFAULT_WIDGETS = [
  { id: "attention", visible: true, order: 0, height: 180 },
  { id: "jobs", visible: true, order: 1, height: 180 },
  { id: "activity", visible: true, order: 2, height: 220 },
  { id: "health", visible: true, order: 3, height: 200 }
];
const DEFAULT_RIGHT_PANEL_MANIFEST = {
  version: 1,
  collapsed: false,
  widgets: DEFAULT_WIDGETS
};
function isRecord$1(value) {
  return typeof value === "object" && value !== null;
}
function isWidgetId$1(value) {
  return value === "attention" || value === "jobs" || value === "activity" || value === "health";
}
function normalizeWidgetEntry(raw, fallbackOrder) {
  if (!isRecord$1(raw) || !isWidgetId$1(raw.id)) {
    return null;
  }
  return {
    id: raw.id,
    visible: typeof raw.visible === "boolean" ? raw.visible : true,
    order: typeof raw.order === "number" ? raw.order : fallbackOrder,
    height: typeof raw.height === "number" && raw.height >= 120 ? raw.height : 180
  };
}
function normalizeManifest(raw) {
  if (!isRecord$1(raw)) {
    return DEFAULT_RIGHT_PANEL_MANIFEST;
  }
  const widgetsRaw = Array.isArray(raw.widgets) ? raw.widgets : [];
  const widgets = widgetsRaw.map((entry, index) => normalizeWidgetEntry(entry, index)).filter((entry) => entry !== null).sort((left, right) => left.order - right.order);
  const mergedWidgets = DEFAULT_WIDGETS.map((defaultEntry) => {
    const existing = widgets.find((entry) => entry.id === defaultEntry.id);
    return existing ?? defaultEntry;
  });
  return {
    version: typeof raw.version === "number" ? raw.version : 1,
    collapsed: typeof raw.collapsed === "boolean" ? raw.collapsed : false,
    widgets: mergedWidgets
  };
}
async function panelPaths(workspaceRoot) {
  const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
  const uiDir = join(binding.harnessRoot, "ui");
  return {
    uiDir,
    manifestPath: join(uiDir, "right-panel.yaml")
  };
}
async function readRightPanelManifest(workspaceRoot) {
  const paths = await panelPaths(workspaceRoot);
  try {
    const raw = await readFile(paths.manifestPath, "utf8");
    return normalizeManifest(parse(raw));
  } catch {
    await writeRightPanelManifest(DEFAULT_RIGHT_PANEL_MANIFEST, workspaceRoot);
    return DEFAULT_RIGHT_PANEL_MANIFEST;
  }
}
async function writeRightPanelManifest(manifest, workspaceRoot) {
  const paths = await panelPaths(workspaceRoot);
  await mkdir(paths.uiDir, { recursive: true });
  const normalized = normalizeManifest(manifest);
  await writeFile(paths.manifestPath, stringify(normalized), "utf8");
  return normalized;
}
async function patchRightPanelManifest(patch, workspaceRoot) {
  const current = await readRightPanelManifest(workspaceRoot);
  return writeRightPanelManifest({
    ...current,
    collapsed: patch.collapsed ?? current.collapsed,
    widgets: patch.widgets ?? current.widgets
  }, workspaceRoot);
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isWidgetId(value) {
  return value === "attention" || value === "jobs" || value === "activity" || value === "health";
}
function parseWidgets(raw) {
  if (!Array.isArray(raw)) {
    return void 0;
  }
  const widgets = [];
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry) || !isWidgetId(entry.id)) {
      continue;
    }
    widgets.push({
      id: entry.id,
      visible: typeof entry.visible === "boolean" ? entry.visible : true,
      order: typeof entry.order === "number" ? entry.order : index,
      height: typeof entry.height === "number" ? entry.height : 180
    });
  }
  return widgets.length > 0 ? widgets : void 0;
}
const GET = async ({ request, url }) => {
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const manifest = await readRightPanelManifest(workspaceRoot);
    return jsonOk(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load panel manifest";
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
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const manifest = await patchRightPanelManifest({
      collapsed: typeof body.collapsed === "boolean" ? body.collapsed : void 0,
      widgets: parseWidgets(body.widgets)
    }, workspaceRoot);
    return jsonOk(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update panel manifest";
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
