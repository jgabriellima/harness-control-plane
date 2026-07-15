const FILE_EXTENSION = "md|mdx|ts|tsx|js|jsx|json|yaml|yml|html|htm|css|txt|py|sh|astro|toml|xml|csv|tsv|pdf|pptx|ppt|docx|doc|xlsx|xls|odt|odp|rtf|gltf|glb|obj|stl|fbx|usdz|blend|dxf|dwg|step|stp|iges|igs|png|jpg|jpeg|gif|webp|svg";
const PATH_SEGMENT = "[\\w@.+() ~-]+";
const FILE_PATH_PATTERN = new RegExp(
  `^(?:${PATH_SEGMENT}\\/)+${PATH_SEGMENT}\\.(?:${FILE_EXTENSION})$`,
  "i"
);
const SINGLE_SEGMENT_PATTERN = new RegExp(`^${PATH_SEGMENT}\\.(?:${FILE_EXTENSION})$`, "i");
const MARKDOWN_EXTENSIONS = /* @__PURE__ */ new Set(["md", "mdx"]);
const CODE_EXTENSIONS = /* @__PURE__ */ new Set(["ts", "tsx", "js", "jsx", "py", "sh", "astro", "json", "yaml", "yml"]);
const HTML_EXTENSIONS = /* @__PURE__ */ new Set(["html", "htm"]);
function isLikelyFilePath(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes(" ") || trimmed.includes("\n")) {
    return false;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return false;
  }
  const withoutAlias = trimmed.replace(/^@(workspace|project):?\//i, "");
  return FILE_PATH_PATTERN.test(withoutAlias) || SINGLE_SEGMENT_PATTERN.test(withoutAlias);
}
function inferMimeFromPath(filePath) {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return "text/markdown";
  }
  if (HTML_EXTENSIONS.has(extension)) {
    return "text/html";
  }
  if (extension === "json") {
    return "application/json";
  }
  if (extension === "pdf") {
    return "application/pdf";
  }
  if (extension === "pptx" || extension === "ppt") {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (extension === "docx" || extension === "doc") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (extension === "xlsx" || extension === "xls") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (extension === "csv" || extension === "tsv") {
    return "text/csv";
  }
  if (extension === "gltf") {
    return "model/gltf+json";
  }
  if (extension === "glb") {
    return "model/gltf-binary";
  }
  if (extension === "obj") {
    return "model/obj";
  }
  if (extension === "stl") {
    return "model/stl";
  }
  if (extension === "fbx") {
    return "model/fbx";
  }
  if (extension === "blend") {
    return "application/x-blender";
  }
  if (extension === "dxf") {
    return "image/vnd.dxf";
  }
  if (extension === "dwg") {
    return "image/vnd.dwg";
  }
  if (extension === "step" || extension === "stp") {
    return "model/step";
  }
  if (extension === "png") {
    return "image/png";
  }
  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }
  if (extension === "gif") {
    return "image/gif";
  }
  if (extension === "webp") {
    return "image/webp";
  }
  if (extension === "svg") {
    return "image/svg+xml";
  }
  if (CODE_EXTENSIONS.has(extension)) {
    return "text/plain";
  }
  return "text/plain";
}
function isBinaryWorkspaceFile(mime) {
  if (mime === "application/pdf") {
    return true;
  }
  if (mime.startsWith("image/")) {
    return true;
  }
  if (mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || mime === "application/vnd.ms-excel" || mime === "application/msword" || mime === "application/vnd.ms-powerpoint" || mime === "application/x-blender" || mime.startsWith("model/") || mime === "image/vnd.dxf" || mime === "image/vnd.dwg") {
    return true;
  }
  return false;
}
function fileNameFromPath(filePath) {
  const segments = filePath.split("/");
  return segments[segments.length - 1] ?? filePath;
}
function normalizeArtifactPath(raw) {
  let trimmed = raw.trim().replace(/^@(workspace|project):?\//i, "").replace(/\\/g, "/");
  const businessIdx = trimmed.indexOf(".business/");
  if (businessIdx >= 0) {
    return trimmed.slice(businessIdx);
  }
  const outputsIdx = trimmed.indexOf(".outputs/");
  if (outputsIdx >= 0) {
    return trimmed.slice(outputsIdx);
  }
  const uploadsIdx = trimmed.indexOf(".uploads/");
  if (uploadsIdx >= 0) {
    return trimmed.slice(uploadsIdx);
  }
  const sdlcIdx = trimmed.indexOf(".sdlc/");
  if (sdlcIdx >= 0) {
    return trimmed.slice(sdlcIdx);
  }
  const cursorIdx = trimmed.indexOf(".cursor/");
  if (cursorIdx >= 0) {
    return trimmed.slice(cursorIdx);
  }
  const workspaceMatch = trimmed.match(/(?:^|\/)workspaces\/[^/]+\/(.+)$/);
  if (workspaceMatch?.[1]) {
    return workspaceMatch[1];
  }
  return trimmed.replace(/^\/+/, "");
}
function isOpenableWorkspaceArtifactPath(normalizedPath) {
  const path = normalizedPath.trim();
  if (!path) {
    return false;
  }
  if (path.startsWith("/")) {
    return false;
  }
  if (/^[A-Za-z]:/.test(path) || path.includes(":\\")) {
    return false;
  }
  if (path.startsWith(".cursor/projects/")) {
    return false;
  }
  if (/(^|\/)Users\//.test(path) || /(^|\/)home\//.test(path)) {
    return false;
  }
  return true;
}
function buildWorkspaceFileRawUrl(path, projectId) {
  const params = new URLSearchParams({ path, raw: "1" });
  const trimmedProjectId = projectId?.trim();
  if (trimmedProjectId) {
    params.set("project_id", trimmedProjectId);
  }
  return `/api/workspace/file?${params.toString()}`;
}

export { isLikelyFilePath as a, isBinaryWorkspaceFile as b, buildWorkspaceFileRawUrl as c, isOpenableWorkspaceArtifactPath as d, fileNameFromPath as f, inferMimeFromPath as i, normalizeArtifactPath as n };
