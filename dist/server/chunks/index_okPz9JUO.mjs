import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { readdir, stat } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { i as inferMimeFromPath } from './file-reference_ZEJYIQDa.mjs';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
import { l as listWorkspaceProjects, r as resolveProjectWorkspaceRoot } from './workspace-manager_C2YuGzrP.mjs';

const MAX_LIBRARY_FILES = 2e3;
const SKIP_FILE_NAMES = /* @__PURE__ */ new Set(["README.md", ".gitkeep", ".DS_Store"]);
function libraryItemKind(mime) {
  return mime.startsWith("image/") ? "image" : "file";
}
function encodeLibraryItemId(projectId, path) {
  return `${projectId}::${path}`;
}
async function walkLibraryFiles(absoluteDir, workspaceRoot, source, projectId, projectName, collected) {
  if (collected.length >= MAX_LIBRARY_FILES) {
    return;
  }
  let entries;
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (collected.length >= MAX_LIBRARY_FILES) {
      break;
    }
    const absolutePath = join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      await walkLibraryFiles(absolutePath, workspaceRoot, source, projectId, projectName, collected);
      continue;
    }
    if (!entry.isFile() || SKIP_FILE_NAMES.has(entry.name)) {
      continue;
    }
    let fileStat;
    try {
      fileStat = await stat(absolutePath);
    } catch {
      continue;
    }
    const displayPath = relative(workspaceRoot, absolutePath).replace(/\\/g, "/");
    const mime = inferMimeFromPath(displayPath);
    collected.push({
      id: encodeLibraryItemId(projectId, displayPath),
      name: entry.name,
      path: displayPath,
      projectId,
      projectName,
      source,
      mime,
      size: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
      kind: libraryItemKind(mime)
    });
  }
}
async function collectPlaybookArtifactLibraryFiles(harnessRoot, workspaceRoot, projectId, projectName, collected) {
  const runsDir = join(harnessRoot, "playbooks", "runs");
  let runEntries;
  try {
    runEntries = await readdir(runsDir, { withFileTypes: true });
  } catch {
    return;
  }
  const runIds = runEntries.filter((entry) => entry.isDirectory() && entry.name.startsWith("playbook-")).map((entry) => entry.name).sort().reverse();
  for (const runId of runIds) {
    if (collected.length >= MAX_LIBRARY_FILES) {
      break;
    }
    const artifactsDir = join(runsDir, runId, "artifacts");
    await walkLibraryFiles(
      artifactsDir,
      workspaceRoot,
      "playbook-artifact",
      projectId,
      projectName,
      collected
    );
  }
}
async function collectProjectLibraryFiles(workspaceRoot, projectId, projectName) {
  const resolvedWorkspaceRoot = resolve(workspaceRoot);
  const binding = await resolveHarnessBinding({ workspaceRoot: resolvedWorkspaceRoot });
  const collected = [];
  await walkLibraryFiles(
    join(resolvedWorkspaceRoot, ".uploads"),
    resolvedWorkspaceRoot,
    "upload",
    projectId,
    projectName,
    collected
  );
  await walkLibraryFiles(
    join(resolvedWorkspaceRoot, ".outputs"),
    resolvedWorkspaceRoot,
    "output",
    projectId,
    projectName,
    collected
  );
  const workflowOutputDir = join(binding.harnessRoot, "workflows", "output");
  await walkLibraryFiles(
    workflowOutputDir,
    resolvedWorkspaceRoot,
    "workflow-output",
    projectId,
    projectName,
    collected
  );
  await collectPlaybookArtifactLibraryFiles(
    binding.harnessRoot,
    resolvedWorkspaceRoot,
    projectId,
    projectName,
    collected
  );
  return collected;
}
function dedupeLibraryItems(items) {
  const seen = /* @__PURE__ */ new Set();
  const deduped = [];
  for (const item of items) {
    const key = item.id.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}
function matchesQuery(item, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return item.name.toLowerCase().includes(normalized) || item.path.toLowerCase().includes(normalized) || item.projectName.toLowerCase().includes(normalized);
}
function sortLibraryItems(items, sort, sortDir) {
  const direction = sortDir === "asc" ? 1 : -1;
  return [...items].sort((left, right) => {
    if (sort === "name") {
      return direction * left.name.localeCompare(right.name);
    }
    if (sort === "size") {
      return direction * (left.size - right.size);
    }
    const leftTime = Date.parse(left.modifiedAt);
    const rightTime = Date.parse(right.modifiedAt);
    return direction * (leftTime - rightTime);
  });
}
async function listLibraryItems(options = {}) {
  const kind = options.kind ?? "all";
  const sort = options.sort ?? "modified";
  const sortDir = options.sortDir ?? "desc";
  const limit = options.limit ?? MAX_LIBRARY_FILES;
  const query = options.query ?? "";
  const projects = await listWorkspaceProjects();
  const scopedProjects = options.projectId?.trim() ? projects.filter((project) => project.id === options.projectId?.trim()) : projects;
  const collected = [];
  for (const project of scopedProjects) {
    if (collected.length >= MAX_LIBRARY_FILES) {
      break;
    }
    const workspaceRoot = project.path ?? resolveProjectWorkspaceRoot(project.id);
    const projectFiles = await collectProjectLibraryFiles(workspaceRoot, project.id, project.name);
    collected.push(...projectFiles);
  }
  let filtered = dedupeLibraryItems(collected).filter((item) => matchesQuery(item, query));
  if (kind === "images") {
    filtered = filtered.filter((item) => item.kind === "image");
  } else if (kind === "files") {
    filtered = filtered.filter((item) => item.kind === "file");
  }
  filtered = sortLibraryItems(filtered, sort, sortDir);
  return filtered.slice(0, limit);
}

function parseKindFilter(value) {
  if (value === "images" || value === "files") {
    return value;
  }
  return "all";
}
function parseSort(value) {
  if (value === "name" || value === "size") {
    return value;
  }
  return "modified";
}
function parseSortDir(value) {
  return value === "asc" ? "asc" : "desc";
}
const GET = async ({ url }) => {
  try {
    const items = await listLibraryItems({
      query: url.searchParams.get("q") ?? "",
      kind: parseKindFilter(url.searchParams.get("kind")),
      projectId: url.searchParams.get("project_id")?.trim() || void 0,
      sort: parseSort(url.searchParams.get("sort")),
      sortDir: parseSortDir(url.searchParams.get("sort_dir"))
    });
    return jsonOk({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list library items";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
