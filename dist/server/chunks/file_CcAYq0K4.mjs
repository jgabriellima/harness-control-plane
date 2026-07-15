import { stat, readdir, readFile, access } from 'node:fs/promises';
import { j as jsonError, a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { a as toUserFacingArtifactErrorMessage } from './user-facing-error_YGytcYdz.mjs';
import { r as runtimeLogger, e as errorFields } from './runtime-run-failure_BzuNxIfC.mjs';
import { resolve, join, basename } from 'node:path';
import { i as inferMimeFromPath, b as isBinaryWorkspaceFile } from './file-reference_ZEJYIQDa.mjs';
import { r as resolveHarnessBinding, d as resolveRepoRoot, a as resolvePlatformAppRoot, c as resolveControlPlaneInstallRoot } from './harness-binding_CgEjapvr.mjs';
import { d as resolveActiveWorkspaceRoot } from './workspace-manager_C2YuGzrP.mjs';
import { r as resolveRequestWorkspace } from './workspace-request_BzgBx_aP.mjs';

function normalizeRequestedPath(requestedPath) {
  return requestedPath.replace(/^\/+/, "").trim();
}
function stripWorkspacePathAlias(requestedPath) {
  return requestedPath.trim().replace(/^@(workspace|project):?\//i, "").replace(/^\/+/, "");
}
function expandWorkspacePathCandidates(requestedPath, harnessDirRel) {
  const normalized = stripWorkspacePathAlias(requestedPath);
  if (!normalized) {
    return [];
  }
  const candidates = [normalized];
  const harnessPrefix = harnessDirRel?.replace(/\/$/, "") ?? null;
  if (!normalized.includes("/")) {
    if (harnessPrefix) {
      candidates.push(`${harnessPrefix}/${normalized}`);
    }
    candidates.push(
      `.outputs/${normalized}`,
      `.uploads/${normalized}`,
      `.cursor/${normalized}`,
      `.sdlc/${normalized}`,
      `app/${normalized}`
    );
    if (harnessPrefix && (normalized.endsWith(".yaml") || normalized.endsWith(".yml"))) {
      candidates.unshift(`${harnessPrefix}/${normalized}`);
    }
    if (normalized === ".env" || normalized === "env") {
      candidates.unshift(".env");
    }
    candidates.push(`src/lib/${normalized}`);
  }
  return [...new Set(candidates)];
}
async function findFileByBasename(dir, targetBasename) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isFile() && entry.name === targetBasename) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const nested = await findFileByBasename(fullPath, targetBasename);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}
async function findMostRecentFileByBasename(targetBasename, searchDirs, allowedRoots) {
  let best = null;
  for (const searchDir of searchDirs) {
    const absolutePath = await findFileByBasename(searchDir, targetBasename);
    if (!absolutePath) {
      continue;
    }
    let safePath;
    try {
      safePath = assertWithinRoots(absolutePath, allowedRoots);
    } catch {
      continue;
    }
    let fileStat;
    try {
      fileStat = await stat(safePath);
    } catch {
      continue;
    }
    if (!fileStat.isFile()) {
      continue;
    }
    const displayPath = relativePathFromRoots(safePath, allowedRoots, targetBasename);
    const modifiedAtMs = fileStat.mtimeMs;
    if (!best || modifiedAtMs > best.modifiedAtMs) {
      best = { safePath, displayPath, modifiedAtMs };
    }
  }
  return best;
}
async function findRecentPlaybookArtifactRelativePath(filename, harnessRoot) {
  const targetBasename = basename(filename.trim());
  if (!targetBasename || targetBasename.includes("/")) {
    return null;
  }
  const runsDir = join(harnessRoot, "playbooks", "runs");
  if (!await fileExists(runsDir)) {
    return null;
  }
  let runEntries;
  try {
    runEntries = await readdir(runsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const runIds = runEntries.filter((entry) => entry.isDirectory() && entry.name.startsWith("playbook-")).map((entry) => entry.name).sort().reverse();
  for (const runId of runIds) {
    const artifactsDir = join(runsDir, runId, "artifacts");
    const absolutePath = await findFileByBasename(artifactsDir, targetBasename);
    if (!absolutePath) {
      continue;
    }
    const harnessResolved = resolve(harnessRoot);
    const resolvedArtifact = resolve(absolutePath);
    if (resolvedArtifact === harnessResolved || !resolvedArtifact.startsWith(`${harnessResolved}/`)) {
      continue;
    }
    return resolvedArtifact.slice(harnessResolved.length + 1);
  }
  return null;
}
function assertWithinRoots(filePath, allowedRoots) {
  const resolved = resolve(filePath);
  for (const root of allowedRoots) {
    if (resolved === root || resolved.startsWith(`${root}/`)) {
      return resolved;
    }
  }
  throw new Error("Path is outside workspace root");
}
async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
function relativePathFromRoots(filePath, roots, fallback) {
  const resolved = resolve(filePath);
  for (const root of roots) {
    const resolvedRoot = resolve(root);
    if (resolved === resolvedRoot) {
      return "";
    }
    if (resolved.startsWith(`${resolvedRoot}/`)) {
      return resolved.slice(resolvedRoot.length + 1);
    }
  }
  return fallback;
}
async function resolveWorkspaceFileLocation(requestedPath, harnessRoot) {
  const normalizedPath = stripWorkspacePathAlias(normalizeRequestedPath(requestedPath));
  if (!normalizedPath) {
    return null;
  }
  const projectRoot = harnessRoot ?? await resolveActiveWorkspaceRoot();
  const binding = await resolveHarnessBinding({ workspaceRoot: projectRoot });
  const harnessDirRel = binding.harnessRoot.slice(binding.workspaceRoot.length + 1);
  const repoRoot = resolveRepoRoot();
  const appRoot = resolvePlatformAppRoot();
  const controlPlaneRoot = resolveControlPlaneInstallRoot();
  const allowedRoots = [projectRoot, repoRoot, appRoot, controlPlaneRoot];
  const relativeCandidates = expandWorkspacePathCandidates(normalizedPath, harnessDirRel);
  if (!normalizedPath.includes("/")) {
    const playbookArtifact = await findRecentPlaybookArtifactRelativePath(
      normalizedPath,
      binding.harnessRoot
    );
    if (playbookArtifact) {
      const harnessRelative = harnessDirRel ? `${harnessDirRel.replace(/\/$/, "")}/${playbookArtifact}` : playbookArtifact;
      relativeCandidates.unshift(harnessRelative);
    }
  }
  const candidates = relativeCandidates.flatMap((relativePath) => [
    resolve(projectRoot, relativePath),
    resolve(repoRoot, relativePath),
    resolve(appRoot, relativePath),
    resolve(controlPlaneRoot, relativePath)
  ]);
  for (const candidate of [...new Set(candidates)]) {
    let safePath;
    try {
      safePath = assertWithinRoots(candidate, allowedRoots);
    } catch {
      continue;
    }
    if (!await fileExists(safePath)) {
      continue;
    }
    const fileStat = await stat(safePath);
    if (!fileStat.isFile()) {
      continue;
    }
    let displayPath = relativePathFromRoots(safePath, allowedRoots, normalizedPath);
    if (displayPath.startsWith("app/")) {
      displayPath = displayPath.slice(4);
    }
    return {
      safePath,
      displayPath,
      mime: inferMimeFromPath(displayPath),
      size: fileStat.size
    };
  }
  if (!normalizedPath.includes("/")) {
    const searchDirs = [
      join(projectRoot, ".outputs"),
      join(projectRoot, ".uploads"),
      join(binding.harnessRoot, "workflows", "output")
    ];
    const runsDir = join(binding.harnessRoot, "playbooks", "runs");
    if (await fileExists(runsDir)) {
      let runEntries;
      try {
        runEntries = await readdir(runsDir, { withFileTypes: true });
      } catch {
        runEntries = [];
      }
      const runIds = runEntries.filter((entry) => entry.isDirectory() && entry.name.startsWith("playbook-")).map((entry) => entry.name).sort().reverse();
      for (const runId of runIds) {
        searchDirs.push(join(runsDir, runId, "artifacts"));
      }
    }
    const basenameMatch = await findMostRecentFileByBasename(
      normalizedPath,
      searchDirs,
      allowedRoots
    );
    if (basenameMatch) {
      const fileStat = await stat(basenameMatch.safePath);
      let displayPath = basenameMatch.displayPath;
      if (displayPath.startsWith("app/")) {
        displayPath = displayPath.slice(4);
      }
      return {
        safePath: basenameMatch.safePath,
        displayPath,
        mime: inferMimeFromPath(displayPath),
        size: fileStat.size
      };
    }
  }
  return null;
}
async function readWorkspaceFile(requestedPath, harnessRoot) {
  const resolved = await resolveWorkspaceFileLocation(requestedPath, harnessRoot);
  if (!resolved) {
    return null;
  }
  if (resolved.size > 2e6) {
    throw new Error("File exceeds maximum preview size (2MB)");
  }
  if (isBinaryWorkspaceFile(resolved.mime)) {
    return {
      path: resolved.displayPath,
      content: null,
      mime: resolved.mime,
      size: resolved.size,
      encoding: "binary"
    };
  }
  const content = await readFile(resolved.safePath, "utf8");
  return {
    path: resolved.displayPath,
    content,
    mime: resolved.mime,
    size: resolved.size,
    encoding: "utf8"
  };
}

const GET = async ({ url, request }) => {
  const requestedPath = url.searchParams.get("path");
  if (!requestedPath) {
    return jsonError('Query parameter "path" is required', 400);
  }
  try {
    const projectId = url.searchParams.get("project_id")?.trim() || void 0;
    const { workspaceRoot } = await resolveRequestWorkspace(request, projectId);
    if (url.searchParams.get("raw") === "1") {
      const resolved = await resolveWorkspaceFileLocation(requestedPath, workspaceRoot);
      if (!resolved) {
        runtimeLogger.warn("workspace_file.not_found", {
          requested_path: requestedPath,
          project_id: projectId,
          raw: true
        });
        return jsonError(toUserFacingArtifactErrorMessage("File not found"), 404);
      }
      if (resolved.size > 1e7) {
        return jsonError("File exceeds maximum download size (10MB)", 413);
      }
      const bytes = await readFile(resolved.safePath);
      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": resolved.mime,
          "Content-Length": String(resolved.size),
          "Cache-Control": "private, max-age=60",
          "Content-Disposition": `inline; filename="${encodeURIComponent(resolved.displayPath.split("/").pop() ?? "file")}"`
        }
      });
    }
    const file = await readWorkspaceFile(requestedPath, workspaceRoot);
    if (!file) {
      runtimeLogger.warn("workspace_file.not_found", {
        requested_path: requestedPath,
        project_id: projectId
      });
      return jsonError(toUserFacingArtifactErrorMessage("File not found"), 404);
    }
    return jsonOk(file);
  } catch (error) {
    runtimeLogger.error("workspace_file.read_failed", {
      requested_path: requestedPath,
      project_id: url.searchParams.get("project_id")?.trim() || void 0,
      ...errorFields(error)
    });
    return jsonError(
      toUserFacingArtifactErrorMessage(error, "This file couldn't be opened right now."),
      500
    );
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
