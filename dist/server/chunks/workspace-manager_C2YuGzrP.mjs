import { readFile, mkdir, access, readdir, cp, writeFile, rename } from 'node:fs/promises';
import { existsSync, constants } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { parse, stringify } from 'yaml';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { h as hasRuntimeBindingStamp, a as resolvePlatformAppRoot, r as resolveHarnessBinding, b as resolveHostRepoRoot } from './harness-binding_CgEjapvr.mjs';
import { homedir } from 'node:os';
import { D as DEFAULT_WORKSPACE_ID, L as LEGACY_DEFAULT_WORKSPACE_ID } from './workspace-constants_DFgBwlV3.mjs';

function resolveAppRoot(projectRoot) {
  const candidates = [
    process.cwd(),
    join(process.cwd(), ".."),
    join(process.cwd(), "../.."),
    join(process.cwd(), "../../..")
  ];
  for (const candidate of candidates) {
    if (hasRuntimeBindingStamp(candidate)) {
      return candidate;
    }
  }
  return resolvePlatformAppRoot(projectRoot);
}
function resolveHarnessRoot(workspaceRoot) {
  return workspaceRoot;
}

const appRoot = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  resolveAppRoot,
  resolveHarnessRoot
}, Symbol.toStringTag, { value: 'Module' }));

const execFileAsync = promisify(execFile);
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
function isRetryableBindError(error) {
  if (!(error instanceof Error)) {
    return false;
  }
  const text = `${error.message}
${"stderr" in error && typeof error.stderr === "string" ? error.stderr : ""}`;
  return text.includes("no transcript project") || text.includes("transcript missing") || text.includes("sdk-agent-store missing");
}
async function sessionPaths(workspaceRoot) {
  const binding = await resolveHarnessBinding({ workspaceRoot });
  const sessionsDir = join(binding.harnessRoot, "runtime-sessions");
  return {
    harnessRoot: binding.harnessRoot,
    workspaceRoot: binding.workspaceRoot,
    sessionsDir,
    registryPath: join(sessionsDir, "registry.jsonl"),
    indexPath: join(sessionsDir, "index.json"),
    registryScript: join(binding.harnessRoot, "bin", `${binding.cliPrefix}_session_registry.py`)
  };
}
function isRecord$2(value) {
  return typeof value === "object" && value !== null;
}
async function readSessionIndex(workspaceRoot) {
  const paths = await sessionPaths(workspaceRoot ?? resolveAppRoot());
  try {
    const raw = await readFile(paths.indexPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!isRecord$2(parsed) || !Array.isArray(parsed.conversations)) {
      return { version: 1, updatedAt: (/* @__PURE__ */ new Date()).toISOString(), conversations: [] };
    }
    const conversations = parsed.conversations.filter(isRecord$2).map((entry) => ({
      id: typeof entry.id === "string" ? entry.id : "",
      title: typeof entry.title === "string" ? entry.title : "Runtime chat",
      projectId: typeof entry.projectId === "string" ? entry.projectId : "default",
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : (/* @__PURE__ */ new Date()).toISOString(),
      agentId: typeof entry.agentId === "string" ? entry.agentId : void 0,
      archived: entry.archived === true
    })).filter((entry) => entry.id.length > 0);
    return {
      version: typeof parsed.version === "number" ? parsed.version : 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : (/* @__PURE__ */ new Date()).toISOString(),
      conversations
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { version: 1, updatedAt: (/* @__PURE__ */ new Date()).toISOString(), conversations: [] };
    }
    throw error;
  }
}
async function readLatestBindings(workspaceRoot) {
  const paths = await sessionPaths(workspaceRoot ?? resolveAppRoot());
  let raw;
  try {
    raw = await readFile(paths.registryPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return /* @__PURE__ */ new Map();
    }
    throw error;
  }
  const latest = /* @__PURE__ */ new Map();
  for (const line of raw.split("\n")) {
    const stripped = line.trim();
    if (stripped.length === 0) {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(stripped);
    } catch {
      continue;
    }
    if (!isRecord$2(parsed) || parsed.event !== "session.bound") {
      continue;
    }
    const harnessConversationId = typeof parsed.harnessConversationId === "string" ? parsed.harnessConversationId : "";
    if (harnessConversationId.length === 0) {
      continue;
    }
    latest.set(harnessConversationId, parsed);
  }
  return latest;
}
async function bindSession(input) {
  const paths = await sessionPaths(input.workspaceRoot ?? resolveAppRoot());
  const maxAttempts = 6;
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const { stdout } = await execFileAsync(
        "python3",
        [
          paths.registryScript,
          "bind",
          "--conversation-id",
          input.harnessConversationId,
          "--agent-id",
          input.vendorAgentId,
          "--vendor",
          input.vendor ?? "cursor-local"
        ],
        { cwd: paths.workspaceRoot, maxBuffer: 1024 * 1024 }
      );
      return JSON.parse(stdout.trim());
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!isRetryableBindError(error) || attempt === maxAttempts - 1) {
        throw lastError;
      }
      await sleep(250 * 2 ** attempt);
    }
  }
  throw lastError ?? new Error("session bind failed");
}
async function rebuildSessionIndex(workspaceRoot) {
  const paths = await sessionPaths(workspaceRoot ?? resolveAppRoot());
  await execFileAsync("python3", [paths.registryScript, "rebuild-index"], {
    cwd: paths.workspaceRoot,
    maxBuffer: 1024 * 1024
  });
  return readSessionIndex(workspaceRoot);
}

const runtimeSessionRegistry = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  bindSession,
  readLatestBindings,
  readSessionIndex,
  rebuildSessionIndex
}, Symbol.toStringTag, { value: 'Module' }));

function expandHome(pathValue) {
  return pathValue.startsWith("~/") ? join(homedir(), pathValue.slice(2)) : pathValue;
}
function resolveWorkspacesContainer() {
  const override = process.env.CONTROL_PLANE_WORKSPACES_ROOT?.trim() ?? process.env.BUSINESS_WORKSPACES_ROOT?.trim();
  if (override) {
    return resolve(expandHome(override));
  }
  const hostRepo = resolveHostRepoRoot();
  if (existsSync(join(hostRepo, ".sdlc", "sdlc.yaml"))) {
    return join(hostRepo, "workspaces");
  }
  return join(homedir(), "jambu", "workspaces");
}
async function ensureWorkspacesContainer() {
  const container = resolveWorkspacesContainer();
  await mkdir(container, { recursive: true });
  return container;
}
function resolveWorkspacePath(projectId) {
  return join(resolveWorkspacesContainer(), projectId);
}

const PACK_EXCLUDES = /* @__PURE__ */ new Set([
  "runtime-sessions",
  "state",
  "handoffs",
  "traces",
  "workflows/output",
  "runs",
  "projects"
]);
async function pathExists$1(pathValue) {
  try {
    await access(pathValue, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
function isRecord$1(value) {
  return typeof value === "object" && value !== null;
}
async function loadBaselineConfig(baselineRoot) {
  const resolvedRoot = baselineRoot?.trim() || join(resolveHostRepoRoot(), "templates", "workspace-baseline");
  const binding = await resolveHarnessBinding({ workspaceRoot: resolvedRoot });
  const raw = await readFile(binding.dslPath, "utf8");
  const doc = parse(raw);
  if (!isRecord$1(doc) || !isRecord$1(doc.baseline)) {
    return { scope: [".business/**", ".cursor/**"], excludes: [] };
  }
  const baseline = doc.baseline;
  const scope = Array.isArray(baseline.scope) ? baseline.scope.filter((item) => typeof item === "string") : [".business/**", ".cursor/**"];
  const excludes = Array.isArray(baseline.excludes) ? baseline.excludes.filter((item) => typeof item === "string") : [];
  return { scope, excludes };
}
function shouldSkipRelativePath(relativePath, excludes) {
  const normalized = relativePath.replace(/\\/g, "/");
  for (const segment of PACK_EXCLUDES) {
    if (normalized.includes(segment)) {
      return true;
    }
  }
  for (const pattern of excludes) {
    const stripped = pattern.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^\.\//, "");
    if (stripped.length > 0 && normalized.includes(stripped.replace(/\/$/, ""))) {
      return true;
    }
  }
  return false;
}
async function copyTreeFiltered(sourceRoot, targetRoot, excludes) {
  await mkdir(targetRoot, { recursive: true });
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(sourceRoot, entry.name);
    const targetPath = join(targetRoot, entry.name);
    const relativePath = entry.name;
    if (shouldSkipRelativePath(relativePath, excludes)) {
      continue;
    }
    if (entry.isDirectory()) {
      if (entry.name === "runs" && basename(dirname(sourcePath)) === "playbooks") {
        const sub = await readdir(sourcePath, { withFileTypes: true });
        const fixture = sub.find((e) => e.isDirectory() && e.name === "playbook-e2e-fixture");
        if (fixture) {
          await cp(join(sourcePath, fixture.name), join(targetPath, fixture.name), { recursive: true });
        }
        continue;
      }
      await copyTreeFiltered(sourcePath, targetPath, excludes);
    } else if (entry.isFile()) {
      await cp(sourcePath, targetPath);
    }
  }
}
async function patchProjectName(workspacePath, projectName) {
  const binding = await resolveHarnessBinding({ workspaceRoot: workspacePath });
  if (!await pathExists$1(binding.dslPath)) {
    return;
  }
  const raw = await readFile(binding.dslPath, "utf8");
  const doc = parse(raw);
  if (!isRecord$1(doc)) {
    return;
  }
  const project = isRecord$1(doc.project) ? { ...doc.project } : {};
  project.name = projectName;
  project.description = `Business workspace — ${projectName}`;
  doc.project = project;
  doc.initialized = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  doc.status = "operational";
  if (isRecord$1(doc.runtime) && isRecord$1(doc.runtime.session_store)) {
    doc.runtime.session_store.workspace_root = workspacePath;
  }
  await writeFile(binding.dslPath, stringify(doc), "utf8");
}
async function writeWorkspaceLayoutReadmes(workspacePath) {
  const uploadsDir = join(workspacePath, ".uploads");
  const outputsDir = join(workspacePath, ".outputs", "workflows");
  await mkdir(uploadsDir, { recursive: true });
  await mkdir(outputsDir, { recursive: true });
  const uploadsReadme = join(uploadsDir, "README.md");
  if (!await pathExists$1(uploadsReadme)) {
    await writeFile(
      uploadsReadme,
      "# Uploads\n\nOperator and runtime file uploads — outside the harness.\n",
      "utf8"
    );
  }
  const outputsReadme = join(workspacePath, ".outputs", "README.md");
  if (!await pathExists$1(outputsReadme)) {
    await writeFile(
      outputsReadme,
      "# Outputs\n\nEphemeral workflow run bundles — outside `.business/`.\n",
      "utf8"
    );
  }
}
function resolveWorkspaceBaselineRoot() {
  const hostRepo = resolveHostRepoRoot();
  const candidates = [
    join(hostRepo, "harness-baseline"),
    join(hostRepo, "resources", "harness-baseline"),
    join(hostRepo, "templates", "workspace-baseline")
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, ".cursor", "runtime-binding.yaml"))) {
      return candidate;
    }
  }
  throw new Error(
    `Workspace baseline missing — checked ${candidates.join(", ")}. Run: python3 app/.business/bin/business_workspace_template.py export`
  );
}
async function provisionWorkspacePack(workspacePath, projectName) {
  const baselineRoot = resolveWorkspaceBaselineRoot();
  const baselineBinding = await resolveHarnessBinding({ workspaceRoot: baselineRoot });
  const { excludes } = await loadBaselineConfig(baselineRoot);
  await mkdir(workspacePath, { recursive: true });
  const cursorSource = join(baselineRoot, ".cursor");
  const harnessSource = baselineBinding.harnessRoot;
  if (await pathExists$1(cursorSource)) {
    await copyTreeFiltered(cursorSource, join(workspacePath, ".cursor"), excludes);
  }
  if (await pathExists$1(harnessSource)) {
    const harnessDirName = harnessSource.slice(baselineRoot.length + 1);
    await copyTreeFiltered(harnessSource, join(workspacePath, harnessDirName), excludes);
  }
  await writeWorkspaceLayoutReadmes(workspacePath);
  await patchProjectName(workspacePath, projectName);
}
async function isValidWorkspace(workspacePath) {
  return hasRuntimeBindingStamp(workspacePath);
}

const ACTIVE_PROJECT_COOKIE = "br-active-project";
let workspacesReadyPromise = null;
function normalizeWorkspaceId(projectId) {
  const trimmed = projectId?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === LEGACY_DEFAULT_WORKSPACE_ID) {
    return DEFAULT_WORKSPACE_ID;
  }
  return trimmed;
}
async function readSessionCount(workspacePath) {
  try {
    const index = await readSessionIndex(workspacePath);
    return index.conversations.filter((conversation) => conversation.archived !== true).length;
  } catch {
    return 0;
  }
}
async function rewriteSessionProjectIds(workspacePath, fromProjectId, toProjectId) {
  const indexPath = join(workspacePath, ".business", "runtime-sessions", "index.json");
  if (!await pathExists(indexPath)) {
    return;
  }
  try {
    const raw = await readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.conversations)) {
      return;
    }
    let changed = false;
    for (const conversation of parsed.conversations) {
      if (conversation.projectId === fromProjectId) {
        conversation.projectId = toProjectId;
        changed = true;
      }
    }
    if (changed) {
      await writeFile(indexPath, `${JSON.stringify(parsed, null, 2)}
`, "utf8");
    }
  } catch {
  }
}
async function migrateLegacyDefaultWorkspaceId() {
  const container = await ensureWorkspacesContainer();
  const legacyPath = join(container, LEGACY_DEFAULT_WORKSPACE_ID);
  const defaultPath = resolveWorkspacePath(DEFAULT_WORKSPACE_ID);
  if (!await pathExists(legacyPath) || await pathExists(defaultPath)) {
    return;
  }
  await rename(legacyPath, defaultPath);
  await rewriteSessionProjectIds(defaultPath, LEGACY_DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_ID);
  await patchDefaultWorkspaceMetadata(defaultPath);
}
async function ensureDefaultWorkspaceInternal() {
  await ensureWorkspacesContainer();
  await migrateLegacyDefaultWorkspaceId();
  const defaultPath = resolveWorkspacePath(DEFAULT_WORKSPACE_ID);
  if (!await isValidWorkspace(defaultPath)) {
    await provisionWorkspacePack(defaultPath, DEFAULT_WORKSPACE_ID);
  }
  await rewriteSessionProjectIds(defaultPath, LEGACY_DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_ID);
  await patchDefaultWorkspaceMetadata(defaultPath);
}
async function patchDefaultWorkspaceMetadata(defaultPath) {
  const binding = await resolveHarnessBinding({ workspaceRoot: defaultPath });
  if (!await pathExists(binding.dslPath)) {
    return;
  }
  try {
    const raw = await readFile(binding.dslPath, "utf8");
    const doc = parse(raw);
    if (!isRecord(doc)) {
      return;
    }
    const project = isRecord(doc.project) ? { ...doc.project } : {};
    const currentName = typeof project.name === "string" ? project.name : "";
    if (currentName === DEFAULT_WORKSPACE_ID) {
      return;
    }
    project.name = DEFAULT_WORKSPACE_ID;
    project.description = "Default business workspace";
    doc.project = project;
    await writeFile(binding.dslPath, `${stringify(doc)}
`, "utf8");
  } catch {
  }
}
async function ensureWorkspacesReady() {
  if (!workspacesReadyPromise) {
    workspacesReadyPromise = ensureDefaultWorkspaceInternal().catch((error) => {
      workspacesReadyPromise = null;
      throw error;
    });
  }
  await workspacesReadyPromise;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function slugify(name) {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return "unnamed";
  }
  return trimmed.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/_+/g, "_");
}
async function pathExists(pathValue) {
  try {
    await access(pathValue, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
async function readWorkspaceMeta(projectId, activeId) {
  const workspacePath = resolveWorkspacePath(projectId);
  if (!await isValidWorkspace(workspacePath)) {
    return null;
  }
  const binding = await resolveHarnessBinding({ workspaceRoot: workspacePath });
  const raw = await readFile(binding.dslPath, "utf8");
  const doc = parse(raw);
  let name = projectId;
  let description = "";
  let status = "operational";
  let initialized = null;
  if (isRecord(doc)) {
    status = typeof doc.status === "string" ? doc.status : status;
    initialized = typeof doc.initialized === "string" ? doc.initialized : typeof doc.initialized === "number" ? String(doc.initialized) : null;
    if (isRecord(doc.project)) {
      name = typeof doc.project.name === "string" ? doc.project.name : projectId;
      description = typeof doc.project.description === "string" ? doc.project.description : description;
    }
  }
  return {
    id: projectId,
    name,
    description,
    status,
    initialized,
    active: projectId === activeId,
    path: workspacePath
  };
}
function parseActiveProjectId(cookieHeader) {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === ACTIVE_PROJECT_COOKIE) {
      const value = rest.join("=").trim();
      return value.length > 0 ? decodeURIComponent(value) : null;
    }
  }
  return null;
}
function activeProjectCookieHeader(projectId) {
  return `${ACTIVE_PROJECT_COOKIE}=${encodeURIComponent(projectId)}; Path=/; SameSite=Lax; Max-Age=31536000`;
}
async function listWorkspaceProjects(activeId) {
  await ensureWorkspacesReady();
  const container = await ensureWorkspacesContainer();
  let entries = [];
  try {
    const dirEntries = await readdir(container, { withFileTypes: true });
    entries = dirEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
  entries.sort((left, right) => {
    if (left === DEFAULT_WORKSPACE_ID) {
      return -1;
    }
    if (right === DEFAULT_WORKSPACE_ID) {
      return 1;
    }
    return left.localeCompare(right);
  });
  const resolvedActive = normalizeWorkspaceId(activeId) ?? DEFAULT_WORKSPACE_ID ?? entries[0] ?? null;
  const projects = [];
  for (const projectId of entries) {
    const meta = await readWorkspaceMeta(projectId, resolvedActive);
    if (meta) {
      const workspacePath = meta.path ?? resolveWorkspacePath(projectId);
      projects.push({
        ...meta,
        sessionCount: await readSessionCount(workspacePath)
      });
    }
  }
  if (projects.length === 0) {
    return [];
  }
  const hasActive = projects.some((project) => project.active);
  if (!hasActive && projects[0]) {
    projects[0].active = true;
  }
  return projects;
}
async function getWorkspaceProject(projectId, activeId) {
  const projects = await listWorkspaceProjects(activeId ?? projectId);
  return projects.find((project) => project.id === projectId) ?? null;
}
async function createWorkspaceProject(input) {
  const projectId = slugify(input.name);
  const workspacePath = resolveWorkspacePath(projectId);
  if (await pathExists(workspacePath)) {
    throw new Error(`Workspace already exists: ${projectId}`);
  }
  await provisionWorkspacePack(workspacePath, input.name.trim() || projectId);
  const project = await readWorkspaceMeta(projectId, projectId);
  if (!project) {
    throw new Error(`Failed to read provisioned workspace: ${projectId}`);
  }
  project.active = true;
  return project;
}
function resolveProjectWorkspaceRoot(projectId) {
  return resolveWorkspacePath(projectId);
}
async function resolveActiveWorkspaceRoot(activeProjectId) {
  await ensureWorkspacesReady();
  const trimmedActive = normalizeWorkspaceId(activeProjectId);
  if (trimmedActive) {
    const workspacePath = resolveWorkspacePath(trimmedActive);
    if (await isValidWorkspace(workspacePath)) {
      return workspacePath;
    }
  }
  return resolveWorkspacePath(DEFAULT_WORKSPACE_ID);
}

const workspaceManager = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  DEFAULT_WORKSPACE_ID,
  LEGACY_DEFAULT_WORKSPACE_ID,
  activeProjectCookieHeader,
  createWorkspaceProject,
  ensureWorkspacesReady,
  getWorkspaceProject,
  listWorkspaceProjects,
  normalizeWorkspaceId,
  parseActiveProjectId,
  resolveActiveWorkspaceRoot,
  resolveProjectWorkspaceRoot
}, Symbol.toStringTag, { value: 'Module' }));

export { activeProjectCookieHeader as a, resolveAppRoot as b, createWorkspaceProject as c, resolveActiveWorkspaceRoot as d, ensureWorkspacesReady as e, readSessionIndex as f, getWorkspaceProject as g, rebuildSessionIndex as h, bindSession as i, resolveHarnessRoot as j, resolveWorkspacesContainer as k, listWorkspaceProjects as l, ensureWorkspacesContainer as m, normalizeWorkspaceId as n, appRoot as o, parseActiveProjectId as p, runtimeSessionRegistry as q, resolveProjectWorkspaceRoot as r, workspaceManager as w };
