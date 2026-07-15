import { a as isLikelyFilePath, n as normalizeArtifactPath } from './file-reference_ZEJYIQDa.mjs';

const FILE_MUTATION_TOOLS = /* @__PURE__ */ new Set([
  "write",
  "edit",
  "strreplace",
  "search_replace",
  "apply_patch",
  "delete"
]);
const FILE_READ_TOOLS = /* @__PURE__ */ new Set(["read", "grep", "glob"]);
const PATH_ARG_KEYS = ["path", "file_path", "filePath", "target_file", "relativePath", "file"];
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function normalizeExtractedPath(raw) {
  const normalized = normalizeArtifactPath(raw);
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return null;
  }
  return normalized;
}
function collectPathArg(record) {
  for (const key of PATH_ARG_KEYS) {
    const value = record[key];
    if (typeof value === "string") {
      return normalizeExtractedPath(value);
    }
  }
  return null;
}
function collectPathsFromUnknown(value, paths) {
  if (typeof value === "string") {
    if (isLikelyFilePath(value)) {
      const normalized = normalizeExtractedPath(value);
      if (normalized) {
        paths.add(normalized);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPathsFromUnknown(entry, paths);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  const direct = collectPathArg(value);
  if (direct) {
    paths.add(direct);
  }
  for (const nested of Object.values(value)) {
    collectPathsFromUnknown(nested, paths);
  }
}
function normalizedToolName(toolName) {
  return toolName.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}
function inferFileActionFromTool(toolName) {
  const normalized = normalizedToolName(toolName);
  if (normalized === "write") {
    return "create";
  }
  if (normalized === "delete") {
    return "delete";
  }
  if (["edit", "strreplace", "search_replace", "apply_patch"].includes(normalized)) {
    return "edit";
  }
  if (normalized.includes("upload")) {
    return "upload";
  }
  return null;
}
function inferFileActionFromPath(path) {
  const normalized = normalizeArtifactPath(path);
  if (normalized.startsWith(".uploads/")) {
    return "upload";
  }
  return null;
}
function extractFilePathsFromTool(toolName, args, result) {
  const normalized = normalizedToolName(toolName);
  const isFileTool = FILE_MUTATION_TOOLS.has(normalized) || FILE_READ_TOOLS.has(normalized) || normalized.includes("read") || normalized.includes("write") || normalized.includes("edit") || normalized.includes("grep") || normalized.includes("glob");
  if (!isFileTool) {
    return [];
  }
  const paths = /* @__PURE__ */ new Set();
  collectPathsFromUnknown(args, paths);
  if (FILE_MUTATION_TOOLS.has(normalized)) {
    collectPathsFromUnknown(result, paths);
  }
  return [...paths];
}

export { inferFileActionFromPath as a, extractFilePathsFromTool as e, inferFileActionFromTool as i };
