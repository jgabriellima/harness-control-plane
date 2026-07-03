const FILE_EXTENSION =
  'md|mdx|ts|tsx|js|jsx|json|yaml|yml|html|htm|css|txt|py|sh|astro|toml|xml|csv|pdf|pptx|docx|png|jpg|jpeg|gif|webp|svg';

const PATH_SEGMENT = '[\\w@.+() ~-]+';

const FILE_PATH_PATTERN = new RegExp(
  `^(?:${PATH_SEGMENT}\\/)+${PATH_SEGMENT}\\.(?:${FILE_EXTENSION})$`,
  'i',
);

const SINGLE_SEGMENT_PATTERN = new RegExp(`^${PATH_SEGMENT}\\.(?:${FILE_EXTENSION})$`, 'i');

const MARKDOWN_EXTENSIONS = new Set(['md', 'mdx']);
const CODE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'sh', 'astro', 'json', 'yaml', 'yml']);
const HTML_EXTENSIONS = new Set(['html', 'htm']);

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

  if (extension === 'pptx') {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }

  if (extension === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
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
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
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
export function dedupeArtifactPaths(paths: string[]): string[] {
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

  return [...byBasename.values()].sort((left, right) => left.localeCompare(right));
}

export function buildWorkspaceFileRawUrl(path: string, projectId?: string): string {
  const params = new URLSearchParams({ path, raw: '1' });
  const trimmedProjectId = projectId?.trim();
  if (trimmedProjectId) {
    params.set('project_id', trimmedProjectId);
  }
  return `/api/workspace/file?${params.toString()}`;
}
