import { readdir } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';

import type { FileMentionSuggestion } from './composer-mention';
import { rankFileMentionSuggestions } from './composer-mention';
import { resolveHarnessBinding } from './harness-binding';

const MAX_INDEXED_FILES = 600;
const MAX_RESULTS = 20;
const SKIP_FILE_NAMES = new Set(['README.md', '.gitkeep', '.DS_Store']);

async function walkDirectoryFiles(
  absoluteDir: string,
  workspaceRoot: string,
  source: FileMentionSuggestion['source'],
  collected: FileMentionSuggestion[],
): Promise<void> {
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

    const displayPath = relative(workspaceRoot, absolutePath).replace(/\\/g, '/');
    collected.push({
      path: displayPath,
      name: entry.name,
      source,
    });
  }
}

async function collectPlaybookArtifactFiles(
  harnessRoot: string,
  workspaceRoot: string,
  collected: FileMentionSuggestion[],
): Promise<void> {
  const runsDir = join(harnessRoot, 'playbooks', 'runs');
  let runEntries;
  try {
    runEntries = await readdir(runsDir, { withFileTypes: true });
  } catch {
    return;
  }

  const runIds = runEntries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('playbook-'))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const runId of runIds) {
    if (collected.length >= MAX_INDEXED_FILES) {
      break;
    }

    const artifactsDir = join(runsDir, runId, 'artifacts');
    await walkDirectoryFiles(artifactsDir, workspaceRoot, 'playbook-artifact', collected);
  }
}

function dedupeMentionFiles(files: FileMentionSuggestion[]): FileMentionSuggestion[] {
  const seen = new Set<string>();
  const deduped: FileMentionSuggestion[] = [];

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

export async function listWorkspaceMentionFiles(
  workspaceRoot: string,
  query: string,
): Promise<FileMentionSuggestion[]> {
  const binding = await resolveHarnessBinding({ workspaceRoot });
  const resolvedWorkspaceRoot = resolve(workspaceRoot);
  const collected: FileMentionSuggestion[] = [];

  await walkDirectoryFiles(
    join(resolvedWorkspaceRoot, '.uploads'),
    resolvedWorkspaceRoot,
    'upload',
    collected,
  );
  await walkDirectoryFiles(
    join(resolvedWorkspaceRoot, '.outputs'),
    resolvedWorkspaceRoot,
    'output',
    collected,
  );
  await walkDirectoryFiles(
    join(binding.harnessRoot, 'workflows', 'output'),
    resolvedWorkspaceRoot,
    'output',
    collected,
  );
  await collectPlaybookArtifactFiles(binding.harnessRoot, resolvedWorkspaceRoot, collected);

  return rankFileMentionSuggestions(dedupeMentionFiles(collected), query, MAX_RESULTS);
}

export function basenameFromWorkspacePath(filePath: string): string {
  return basename(filePath.trim().replace(/\\/g, '/'));
}
