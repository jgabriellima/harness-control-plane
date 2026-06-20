const FILE_PATH_PATTERN =
  /^(?:[\w@.+~-]+\/)+[\w@.+~-]+\.(?:md|mdx|ts|tsx|js|jsx|json|yaml|yml|html|htm|css|txt|py|sh|astro|toml|xml|csv)$/i;

const SINGLE_SEGMENT_PATTERN =
  /^[\w@.+~-]+\.(?:md|mdx|ts|tsx|js|jsx|json|yaml|yml|html|htm|css|txt|py|sh|astro|toml|xml|csv)$/i;

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

  if (CODE_EXTENSIONS.has(extension)) {
    return 'text/plain';
  }

  return 'text/plain';
}

export function fileNameFromPath(filePath: string): string {
  const segments = filePath.split('/');
  return segments[segments.length - 1] ?? filePath;
}
