const FILE_EXTENSION =
  'md|mdx|ts|tsx|js|jsx|json|yaml|yml|html|htm|css|txt|py|sh|astro|toml|xml|csv|tsv|pdf|pptx|ppt|docx|doc|xlsx|xls|odt|odp|rtf|gltf|glb|obj|stl|fbx|usdz|blend|dxf|dwg|step|stp|iges|igs|png|jpg|jpeg|gif|webp|svg';

const PATH_SEGMENT = '[\\w@.+() ~-]+';

const FILE_PATH_PATTERN = new RegExp(
  `^(?:${PATH_SEGMENT}\\/)+${PATH_SEGMENT}\\.(?:${FILE_EXTENSION})$`,
  'i',
);

const SINGLE_SEGMENT_PATTERN = new RegExp(`^${PATH_SEGMENT}\\.(?:${FILE_EXTENSION})$`, 'i');

const MARKDOWN_EXTENSIONS = new Set(['md', 'mdx']);
const CODE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'sh', 'astro', 'json', 'yaml', 'yml']);
const HTML_EXTENSIONS = new Set(['html', 'htm']);

const MONACO_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  html: 'html',
  htm: 'html',
  css: 'css',
  astro: 'html',
  toml: 'ini',
  xml: 'xml',
  md: 'markdown',
  mdx: 'markdown',
  csv: 'plaintext',
  tsv: 'plaintext',
  txt: 'plaintext',
};

export function isLikelyFilePath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes(' ') || trimmed.includes('\n')) {
    return false;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return false;
  }

  const withoutAlias = trimmed.replace(/^@(workspace|project):?\//i, '');

  return FILE_PATH_PATTERN.test(withoutAlias) || SINGLE_SEGMENT_PATTERN.test(withoutAlias);
}

export function inferMimeFromPath(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';

  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return 'text/markdown';
  }

  if (HTML_EXTENSIONS.has(extension)) {
    return 'text/html';
  }

  if (extension === 'json') {
    return 'application/json';
  }

  if (extension === 'pdf') {
    return 'application/pdf';
  }

  if (extension === 'pptx' || extension === 'ppt') {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }

  if (extension === 'docx' || extension === 'doc') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  if (extension === 'xlsx' || extension === 'xls') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  if (extension === 'csv' || extension === 'tsv') {
    return 'text/csv';
  }

  if (extension === 'gltf') {
    return 'model/gltf+json';
  }

  if (extension === 'glb') {
    return 'model/gltf-binary';
  }

  if (extension === 'obj') {
    return 'model/obj';
  }

  if (extension === 'stl') {
    return 'model/stl';
  }

  if (extension === 'fbx') {
    return 'model/fbx';
  }

  if (extension === 'blend') {
    return 'application/x-blender';
  }

  if (extension === 'dxf') {
    return 'image/vnd.dxf';
  }

  if (extension === 'dwg') {
    return 'image/vnd.dwg';
  }

  if (extension === 'step' || extension === 'stp') {
    return 'model/step';
  }

  if (extension === 'png') {
    return 'image/png';
  }

  if (extension === 'jpg' || extension === 'jpeg') {
    return 'image/jpeg';
  }

  if (extension === 'gif') {
    return 'image/gif';
  }

  if (extension === 'webp') {
    return 'image/webp';
  }

  if (extension === 'svg') {
    return 'image/svg+xml';
  }

  if (CODE_EXTENSIONS.has(extension)) {
    return 'text/plain';
  }

  return 'text/plain';
}

/** Files that must not be decoded as UTF-8 text in the artifact panel. */
export function isBinaryWorkspaceFile(mime: string): boolean {
  if (mime === 'application/pdf') {
    return true;
  }

  if (mime.startsWith('image/')) {
    return true;
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/msword' ||
    mime === 'application/vnd.ms-powerpoint' ||
    mime === 'application/x-blender' ||
    mime.startsWith('model/') ||
    mime === 'image/vnd.dxf' ||
    mime === 'image/vnd.dwg'
  ) {
    return true;
  }

  return false;
}

/** MIME types the preview tab can render inline via the raw file endpoint. */
export function isInlinePreviewMime(mime: string): boolean {
  return mime === 'application/pdf' || mime.startsWith('image/');
}

export function fileNameFromPath(filePath: string): string {
  const segments = filePath.split('/');
  return segments[segments.length - 1] ?? filePath;
}

/** Monaco editor language id for syntax-highlighted artifact preview. */
export function inferMonacoLanguageFromPath(filePath: string, mime?: string): string {
  if (mime === 'application/json') {
    return 'json';
  }

  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
  return MONACO_LANGUAGE_BY_EXTENSION[extension] ?? 'plaintext';
}

/** True when artifact content should render in the syntax-highlighted code viewer. */
export function isSyntaxHighlightedArtifact(filePath: string, mime: string): boolean {
  if (mime === 'text/markdown' || mime === 'text/html') {
    return false;
  }

  if (isBinaryWorkspaceFile(mime)) {
    return false;
  }

  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (MARKDOWN_EXTENSIONS.has(extension) || HTML_EXTENSIONS.has(extension)) {
    return false;
  }

  const spreadsheetExtensions = new Set(['csv', 'tsv', 'xlsx', 'xls']);
  if (spreadsheetExtensions.has(extension)) {
    return false;
  }

  return true;
}

/** HTML slide deck produced by the slides playbook (deck-viewport shell). */
export function isPresentationHtmlArtifact(filePath: string, content?: string | null): boolean {
  const base = fileNameFromPath(filePath).toLowerCase();

  if (base === 'deck.html') {
    return true;
  }

  if (
    (base === 'index.html' || base === 'deck.html') &&
    (filePath.includes('/presentation/') || filePath.includes('/artifacts/'))
  ) {
    return true;
  }

  if (!content) {
    return false;
  }

  return content.includes('id="deck-viewport"') || content.includes('fitDeckToViewport');
}

/** Artifact types that support fullscreen overlay preview. */
export function isFullscreenCapableArtifact(
  filePath: string,
  mime: string,
  content?: string | null,
): boolean {
  if (mime === 'application/pdf' || mime.startsWith('image/')) {
    return true;
  }

  if (mime === 'text/html' && content) {
    return true;
  }

  return isPresentationHtmlArtifact(filePath, content);
}

/**
 * Collapse absolute or workspace-prefixed paths to harness-relative form
 * (e.g. `/Users/.../workspaces/default/.business/...` → `.business/...`).
 */
export function normalizeArtifactPath(raw: string): string {
  let trimmed = raw.trim().replace(/^@(workspace|project):?\//i, '').replace(/\\/g, '/');

  const businessIdx = trimmed.indexOf('.business/');
  if (businessIdx >= 0) {
    return trimmed.slice(businessIdx);
  }

  const sdlcIdx = trimmed.indexOf('.sdlc/');
  if (sdlcIdx >= 0) {
    return trimmed.slice(sdlcIdx);
  }

  const cursorIdx = trimmed.indexOf('.cursor/');
  if (cursorIdx >= 0) {
    return trimmed.slice(cursorIdx);
  }

  const workspaceMatch = trimmed.match(/(?:^|\/)workspaces\/[^/]+\/(.+)$/);
  if (workspaceMatch?.[1]) {
    return workspaceMatch[1];
  }

  return trimmed.replace(/^\/+/, '');
}

/** Prefer fully-qualified harness paths over bare filenames when both exist. */
export function dedupeArtifactPaths(
  paths: string[],
  options?: { preserveOrder?: boolean },
): string[] {
  const byBasename = new Map<string, string>();

  for (const rawPath of paths) {
    const path = normalizeArtifactPath(rawPath);
    if (!path || !isLikelyFilePath(path)) {
      continue;
    }

    const base = fileNameFromPath(path);
    const existing = byBasename.get(base);
    if (!existing) {
      byBasename.set(base, path);
      continue;
    }

    const pathScore = path.split('/').length + (path.includes('.business/') ? 10 : 0);
    const existingScore = existing.split('/').length + (existing.includes('.business/') ? 10 : 0);
    if (pathScore > existingScore) {
      byBasename.set(base, path);
    }
  }

  const values = [...byBasename.values()];
  if (options?.preserveOrder) {
    return values;
  }
  return values.sort((left, right) => left.localeCompare(right));
}

export function buildWorkspaceFileRawUrl(path: string, projectId?: string): string {
  const params = new URLSearchParams({ path, raw: '1' });
  const trimmedProjectId = projectId?.trim();
  if (trimmedProjectId) {
    params.set('project_id', trimmedProjectId);
  }
  return `/api/workspace/file?${params.toString()}`;
}
