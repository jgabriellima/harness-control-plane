import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { readdir } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { r as rankFileMentionSuggestions } from './composer-mention_DB4vJ80j.mjs';
import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

const MAX_INDEXED_FILES = 600;
const MAX_RESULTS = 20;
const SKIP_FILE_NAMES = /* @__PURE__ */ new Set(["README.md", ".gitkeep", ".DS_Store"]);
async function walkDirectoryFiles(absoluteDir, workspaceRoot, source, collected) {
  if (collected.length >= MAX_INDEXED_FILES) {
    return;
  }
  let entries;
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (collected.length >= MAX_INDEXED_FILES) {
      break;
    }
    const absolutePath = join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      await walkDirectoryFiles(absolutePath, workspaceRoot, source, collected);
      continue;
    }
    if (!entry.isFile() || SKIP_FILE_NAMES.has(entry.name)) {
      continue;
    }
    const displayPath = relative(workspaceRoot, absolutePath).replace(/\\/g, "/");
    collected.push({
      path: displayPath,
      name: entry.name,
      source
    });
  }
}
async function collectPlaybookArtifactFiles(harnessRoot, workspaceRoot, collected) {
  const runsDir = join(harnessRoot, "playbooks", "runs");
  let runEntries;
  try {
    runEntries = await readdir(runsDir, { withFileTypes: true });
  } catch {
    return;
  }
  const runIds = runEntries.filter((entry) => entry.isDirectory() && entry.name.startsWith("playbook-")).map((entry) => entry.name).sort().reverse();
  for (const runId of runIds) {
    if (collected.length >= MAX_INDEXED_FILES) {
      break;
    }
    const artifactsDir = join(runsDir, runId, "artifacts");
    await walkDirectoryFiles(artifactsDir, workspaceRoot, "playbook-artifact", collected);
  }
}
function dedupeMentionFiles(files) {
  const seen = /* @__PURE__ */ new Set();
  const deduped = [];
  for (const file of files) {
    const key = file.path.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(file);
  }
  return deduped;
}
async function listWorkspaceMentionFiles(workspaceRoot, query) {
  const binding = await resolveHarnessBinding({ workspaceRoot });
  const resolvedWorkspaceRoot = resolve(workspaceRoot);
  const collected = [];
  await walkDirectoryFiles(
    join(resolvedWorkspaceRoot, ".uploads"),
    resolvedWorkspaceRoot,
    "upload",
    collected
  );
  await walkDirectoryFiles(
    join(resolvedWorkspaceRoot, ".outputs"),
    resolvedWorkspaceRoot,
    "output",
    collected
  );
  await walkDirectoryFiles(
    join(binding.harnessRoot, "workflows", "output"),
    resolvedWorkspaceRoot,
    "output",
    collected
  );
  await collectPlaybookArtifactFiles(binding.harnessRoot, resolvedWorkspaceRoot, collected);
  return rankFileMentionSuggestions(dedupeMentionFiles(collected), query, MAX_RESULTS);
}

const GET = async ({ url, request }) => {
  const query = url.searchParams.get("q") ?? "";
  try {
    const projectId = url.searchParams.get("project_id")?.trim() || void 0;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    const files = await listWorkspaceMentionFiles(workspaceRoot, query);
    return jsonOk({ files });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list workspace files";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
