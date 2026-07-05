import { dedupeArtifactPaths, isLikelyFilePath, normalizeArtifactPath } from './file-reference';
import { extractFilePathsFromTool } from './tool-file-paths';

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

/**
 * Collect all workspace file paths generated or referenced across a conversation thread.
 */
export function collectThreadFilePaths(messages: ThreadFileMessage[]): string[] {
  const paths = new Set<string>();

  for (const message of messages) {
    if (message.role === 'tool') {
      const tool = resolveToolRecord(message);
      for (const path of extractFilePathsFromTool(tool.name, tool.args, tool.result)) {
        paths.add(path);
      }
    }

    if (message.role === 'assistant') {
      for (const path of extractFilePathsFromMarkdown(message.content)) {
        paths.add(path);
      }
    }
  }

  return dedupeArtifactPaths([...paths]);
}
