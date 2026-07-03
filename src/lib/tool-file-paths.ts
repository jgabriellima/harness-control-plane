import { isLikelyFilePath, normalizeArtifactPath } from './file-reference';

const FILE_MUTATION_TOOLS = new Set([
  'write',
  'edit',
  'strreplace',
  'search_replace',
  'apply_patch',
  'delete',
]);

const FILE_READ_TOOLS = new Set(['read', 'grep', 'glob']);

const PATH_ARG_KEYS = ['path', 'file_path', 'filePath', 'target_file', 'relativePath', 'file'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeExtractedPath(raw: string): string | null {
  const normalized = normalizeArtifactPath(raw);
  if (normalized.length === 0) {
    return null;
  }

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return null;
  }

  return normalized;
}

function collectPathArg(record: Record<string, unknown>): string | null {
  for (const key of PATH_ARG_KEYS) {
    const value = record[key];
    if (typeof value === 'string') {
      return normalizeExtractedPath(value);
    }
  }
  return null;
}

function collectPathsFromUnknown(value: unknown, paths: Set<string>): void {
  if (typeof value === 'string') {
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

function normalizedToolName(toolName: string): string {
  return toolName.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
}

/**
 * Extract workspace-relative file paths referenced by a runtime tool invocation.
 */
export function extractFilePathsFromTool(
  toolName: string,
  args: unknown,
  result?: unknown,
): string[] {
  const normalized = normalizedToolName(toolName);
  const isFileTool =
    FILE_MUTATION_TOOLS.has(normalized) ||
    FILE_READ_TOOLS.has(normalized) ||
    normalized.includes('read') ||
    normalized.includes('write') ||
    normalized.includes('edit') ||
    normalized.includes('grep') ||
    normalized.includes('glob');

  if (!isFileTool) {
    return [];
  }

  const paths = new Set<string>();
  collectPathsFromUnknown(args, paths);

  if (FILE_MUTATION_TOOLS.has(normalized)) {
    collectPathsFromUnknown(result, paths);
  }

  return [...paths];
}

export function mergeFilePaths(existing: string[], incoming: string[]): string[] {
  const merged = new Set(existing);
  for (const path of incoming) {
    merged.add(path);
  }
  return [...merged];
}
