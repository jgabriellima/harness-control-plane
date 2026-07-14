import {
  dedupeArtifactPaths,
  fileNameFromPath,
  isLikelyFilePath,
  isOpenableWorkspaceArtifactPath,
  normalizeArtifactPath,
} from './file-reference';
import type { SdkGeneratedFileRecord } from './sdk-agent-observability-types';
import {
  extractFilePathsFromTool,
  inferFileActionFromPath,
  inferFileActionFromTool,
  type FileArtifactAction,
} from './tool-file-paths';

export interface ThreadFileMessage {
  role: 'user' | 'assistant' | 'system' | 'thinking' | 'tool';
  content: string;
  toolInput?: string;
  toolOutput?: string;
  tool?: {
    name: string;
    status?: string;
    args?: unknown;
    result?: unknown;
  };
}

export interface ThreadFileActivityItem {
  path: string;
  action: FileArtifactAction | null;
}

interface ThreadFileActivityEntry {
  path: string;
  action: FileArtifactAction | null;
}

function extractFilePathsFromMarkdown(content: string): string[] {
  const paths = new Set<string>();
  for (const match of content.matchAll(/`([^`\n]+)`/g)) {
    const candidate = match[1]?.trim();
    if (!candidate) {
      continue;
    }
    const normalized = normalizeArtifactPath(candidate);
    if (isLikelyFilePath(normalized)) {
      paths.add(normalized);
    }
  }
  return [...paths];
}

function resolveToolRecord(message: ThreadFileMessage): {
  name: string;
  args: unknown;
  result: unknown;
} {
  if (message.tool) {
    return {
      name: message.tool.name,
      args: message.tool.args,
      result: message.tool.result,
    };
  }

  const [name = 'tool'] = message.content.split(' · ');
  let args: unknown;
  let result: unknown;
  if (message.toolInput) {
    try {
      args = JSON.parse(message.toolInput);
    } catch {
      args = message.toolInput;
    }
  }
  if (message.toolOutput) {
    try {
      result = JSON.parse(message.toolOutput);
    } catch {
      result = message.toolOutput;
    }
  }
  return {
    name: name.trim(),
    args,
    result,
  };
}

function resolveThreadFileAction(
  path: string,
  action: FileArtifactAction | null,
): FileArtifactAction | null {
  return action ?? inferFileActionFromPath(path);
}

export function dedupeThreadFileActivity(
  entries: ThreadFileActivityEntry[],
  options?: { preserveOrder?: boolean },
): ThreadFileActivityItem[] {
  const byBasename = new Map<string, ThreadFileActivityItem>();

  for (const entry of entries) {
    const path = normalizeArtifactPath(entry.path);
    if (!path || !isLikelyFilePath(path) || !isOpenableWorkspaceArtifactPath(path)) {
      continue;
    }

    const base = fileNameFromPath(path);
    const existing = byBasename.get(base);
    const resolvedAction = resolveThreadFileAction(path, entry.action);

    if (!existing) {
      byBasename.set(base, { path, action: resolvedAction });
      continue;
    }

    const pathScore = path.split('/').length + (path.includes('.business/') ? 10 : 0);
    const existingScore =
      existing.path.split('/').length + (existing.path.includes('.business/') ? 10 : 0);

    if (pathScore > existingScore) {
      byBasename.set(base, {
        path,
        action: resolvedAction ?? existing.action,
      });
      continue;
    }

    if (resolvedAction && !existing.action) {
      byBasename.set(base, { ...existing, action: resolvedAction });
    }
  }

  const values = [...byBasename.values()];
  if (options?.preserveOrder) {
    return values;
  }

  return values.sort((left, right) => left.path.localeCompare(right.path));
}

function collectThreadFileEntries(messages: ThreadFileMessage[]): ThreadFileActivityEntry[] {
  const entries: ThreadFileActivityEntry[] = [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.role === 'tool') {
      const tool = resolveToolRecord(message);
      const action = inferFileActionFromTool(tool.name);
      for (const path of extractFilePathsFromTool(tool.name, tool.args, tool.result)) {
        entries.push({ path, action });
      }
    }

    if (message.role === 'assistant') {
      for (const path of extractFilePathsFromMarkdown(message.content)) {
        entries.push({ path, action: inferFileActionFromPath(path) });
      }
    }
  }

  return entries;
}

/**
 * Collect workspace file activity (path + mutation action) for the composer Files panel.
 */
export function collectThreadFileActivity(
  messages: ThreadFileMessage[],
  generatedFiles: SdkGeneratedFileRecord[] = [],
): ThreadFileActivityItem[] {
  const fromObservability: ThreadFileActivityEntry[] = generatedFiles.map((file) => ({
    path: file.path,
    action: inferFileActionFromTool(file.tool),
  }));

  const fromMessages = collectThreadFileEntries(messages);

  return dedupeThreadFileActivity([...fromObservability, ...fromMessages], { preserveOrder: true });
}

/**
 * Collect all workspace file paths generated or referenced across a conversation thread.
 */
export function collectThreadFilePaths(messages: ThreadFileMessage[]): string[] {
  return collectThreadFileActivity(messages).map((item) => item.path);
}
