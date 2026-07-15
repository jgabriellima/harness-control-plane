import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { r as resolveWorkspaceHarnessBinding } from './workspace-harness-binding_DtkiVVW4.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const SHELL_LAYOUT_DEFAULTS = {
  sidebar: 20,
  context: 22
};
const SHELL_LAYOUT_MIN = {
  sidebar: 16,
  main: 34,
  context: 16
};
function clampPanelSize(value, fallback, minimum) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(40, Math.max(minimum, value));
}

const DEFAULT_SHELL_LAYOUT = {
  version: 1,
  sidebarSize: SHELL_LAYOUT_DEFAULTS.sidebar,
  contextSize: SHELL_LAYOUT_DEFAULTS.context,
  sidebarExpanded: false
};
function isRecord$1(value) {
  return typeof value === "object" && value !== null;
}
function normalizeManifest(raw) {
  if (!isRecord$1(raw)) {
    return DEFAULT_SHELL_LAYOUT;
  }
  return {
    version: typeof raw.version === "number" ? raw.version : 1,
    sidebarSize: clampPanelSize(
      typeof raw.sidebarSize === "number" ? raw.sidebarSize : NaN,
      DEFAULT_SHELL_LAYOUT.sidebarSize,
      SHELL_LAYOUT_MIN.sidebar
    ),
    contextSize: clampPanelSize(
      typeof raw.contextSize === "number" ? raw.contextSize : NaN,
      DEFAULT_SHELL_LAYOUT.contextSize,
      SHELL_LAYOUT_MIN.context
    ),
    sidebarExpanded: typeof raw.sidebarExpanded === "boolean" ? raw.sidebarExpanded : false
  };
}
async function layoutPaths(workspaceRoot) {
  const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
  const uiDir = join(binding.harnessRoot, "ui");
  return {
    uiDir,
    manifestPath: join(uiDir, "shell-layout.yaml")
  };
}
async function readShellLayoutManifest(workspaceRoot) {
  const paths = await layoutPaths(workspaceRoot);
  try {
    const raw = await readFile(paths.manifestPath, "utf8");
    const normalized = normalizeManifest(parse(raw));
    if (normalized.sidebarSize < SHELL_LAYOUT_MIN.sidebar || normalized.contextSize < SHELL_LAYOUT_MIN.context) {
      return writeShellLayoutManifest(DEFAULT_SHELL_LAYOUT, workspaceRoot);
    }
    return normalized;
  } catch {
    await writeShellLayoutManifest(DEFAULT_SHELL_LAYOUT, workspaceRoot);
    return DEFAULT_SHELL_LAYOUT;
  }
}
async function writeShellLayoutManifest(manifest, workspaceRoot) {
  const paths = await layoutPaths(workspaceRoot);
  await mkdir(paths.uiDir, { recursive: true });
  const normalized = normalizeManifest(manifest);
  await writeFile(paths.manifestPath, stringify(normalized), "utf8");
  return normalized;
}
async function patchShellLayoutManifest(patch, workspaceRoot) {
  const current = await readShellLayoutManifest(workspaceRoot);
  return writeShellLayoutManifest({
    ...current,
    ...patch
  }, workspaceRoot);
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
const GET = async ({ request, url }) => {
  try {
    const { workspaceRoot } = await resolveRequestWorkspace(request, url.searchParams.get("project_id"));
    const manifest = await readShellLayoutManifest(workspaceRoot);
    return jsonOk(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load shell layout";
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
    const manifest = await patchShellLayoutManifest({
      sidebarSize: typeof body.sidebarSize === "number" ? body.sidebarSize : void 0,
      contextSize: typeof body.contextSize === "number" ? body.contextSize : void 0,
      sidebarExpanded: typeof body.sidebarExpanded === "boolean" ? body.sidebarExpanded : void 0
    }, workspaceRoot);
    return jsonOk(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update shell layout";
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
