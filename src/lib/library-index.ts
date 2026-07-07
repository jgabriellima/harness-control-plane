import { readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { inferMimeFromPath } from './file-reference';
import { resolveHarnessBinding } from './harness-binding';
import type {
  LibraryItem,
  LibraryItemKind,
  LibraryItemSource,
  LibraryKindFilter,
} from './library-types';
import { listWorkspaceProjects, resolveProjectWorkspaceRoot } from './workspace-manager';

export type {
  LibraryItem,
  LibraryItemKind,
  LibraryItemSource,
  LibraryKindFilter,
} from './library-types';

const MAX_LIBRARY_FILES = 2000;
const SKIP_FILE_NAMES = new Set(['README.md', '.gitkeep', '.DS_Store']);

export interface ListLibraryItemsOptions {
  query?: string;
  kind?: LibraryKindFilter;
  projectId?: string;
  sort?: 'modified' | 'name' | 'size';
  sortDir?: 'asc' | 'desc';
  limit?: number;
}

function libraryItemKind(mime: string): LibraryItemKind {
  return mime.startsWith('image/') ? 'image' : 'file';
}

function encodeLibraryItemId(projectId: string, path: string): string {
  return `${projectId}::${path}`;
}

async function walkLibraryFiles(
  absoluteDir: string,
  workspaceRoot: string,
  source: LibraryItemSource,
  projectId: string,
  projectName: string,
  collected: LibraryItem[],
): Promise<void> {
  if (collected.length >= MAX_LIBRARY_FILES) {
    return;
  }

  let entries;
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (collected.length >= MAX_LIBRARY_FILES) {
      break;
    }

    const absolutePath = join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      await walkLibraryFiles(absolutePath, workspaceRoot, source, projectId, projectName, collected);
      continue;
    }

    if (!entry.isFile() || SKIP_FILE_NAMES.has(entry.name)) {
      continue;
    }

    let fileStat;
    try {
      fileStat = await stat(absolutePath);
    } catch {
      continue;
    }

    const displayPath = relative(workspaceRoot, absolutePath).replace(/\\/g, '/');
    const mime = inferMimeFromPath(displayPath);

    collected.push({
      id: encodeLibraryItemId(projectId, displayPath),
      name: entry.name,
      path: displayPath,
      projectId,
      projectName,
      source,
      mime,
      size: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
      kind: libraryItemKind(mime),
    });
  }
}

async function collectPlaybookArtifactLibraryFiles(
  harnessRoot: string,
  workspaceRoot: string,
  projectId: string,
  projectName: string,
  collected: LibraryItem[],
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
    if (collected.length >= MAX_LIBRARY_FILES) {
      break;
    }

    const artifactsDir = join(runsDir, runId, 'artifacts');
    await walkLibraryFiles(
      artifactsDir,
      workspaceRoot,
      'playbook-artifact',
      projectId,
      projectName,
      collected,
    );
  }
}

async function collectProjectLibraryFiles(
  workspaceRoot: string,
  projectId: string,
  projectName: string,
): Promise<LibraryItem[]> {
  const resolvedWorkspaceRoot = resolve(workspaceRoot);
  const binding = await resolveHarnessBinding({ workspaceRoot: resolvedWorkspaceRoot });
  const collected: LibraryItem[] = [];

  await walkLibraryFiles(
    join(resolvedWorkspaceRoot, '.uploads'),
    resolvedWorkspaceRoot,
    'upload',
    projectId,
    projectName,
    collected,
  );
  await walkLibraryFiles(
    join(resolvedWorkspaceRoot, '.outputs'),
    resolvedWorkspaceRoot,
    'output',
    projectId,
    projectName,
    collected,
  );

  const workflowOutputDir = join(binding.harnessRoot, 'workflows', 'output');
  await walkLibraryFiles(
    workflowOutputDir,
    resolvedWorkspaceRoot,
    'workflow-output',
    projectId,
    projectName,
    collected,
  );

  await collectPlaybookArtifactLibraryFiles(
    binding.harnessRoot,
    resolvedWorkspaceRoot,
    projectId,
    projectName,
    collected,
  );

  return collected;
}

function dedupeLibraryItems(items: LibraryItem[]): LibraryItem[] {
  const seen = new Set<string>();
  const deduped: LibraryItem[] = [];

  for (const item of items) {
    const key = item.id.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function matchesQuery(item: LibraryItem, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return (
    item.name.toLowerCase().includes(normalized) ||
    item.path.toLowerCase().includes(normalized) ||
    item.projectName.toLowerCase().includes(normalized)
  );
}

function sortLibraryItems(
  items: LibraryItem[],
  sort: NonNullable<ListLibraryItemsOptions['sort']>,
  sortDir: NonNullable<ListLibraryItemsOptions['sortDir']>,
): LibraryItem[] {
  const direction = sortDir === 'asc' ? 1 : -1;

  return [...items].sort((left, right) => {
    if (sort === 'name') {
      return direction * left.name.localeCompare(right.name);
    }

    if (sort === 'size') {
      return direction * (left.size - right.size);
    }

    const leftTime = Date.parse(left.modifiedAt);
    const rightTime = Date.parse(right.modifiedAt);
    return direction * (leftTime - rightTime);
  });
}

export async function listProjectLibraryItems(
  workspaceRoot: string,
  projectId: string,
  projectName: string,
  options: Omit<ListLibraryItemsOptions, 'projectId'> = {},
): Promise<LibraryItem[]> {
  const kind = options.kind ?? 'all';
  const sort = options.sort ?? 'modified';
  const sortDir = options.sortDir ?? 'desc';
  const limit = options.limit ?? MAX_LIBRARY_FILES;
  const query = options.query ?? '';

  const collected = await collectProjectLibraryFiles(workspaceRoot, projectId, projectName);
  let filtered = dedupeLibraryItems(collected).filter((item) => matchesQuery(item, query));

  if (kind === 'images') {
    filtered = filtered.filter((item) => item.kind === 'image');
  } else if (kind === 'files') {
    filtered = filtered.filter((item) => item.kind === 'file');
  }

  filtered = sortLibraryItems(filtered, sort, sortDir);

  return filtered.slice(0, limit);
}

export async function listLibraryItems(
  options: ListLibraryItemsOptions = {},
): Promise<LibraryItem[]> {
  const kind = options.kind ?? 'all';
  const sort = options.sort ?? 'modified';
  const sortDir = options.sortDir ?? 'desc';
  const limit = options.limit ?? MAX_LIBRARY_FILES;
  const query = options.query ?? '';

  const projects = await listWorkspaceProjects();
  const scopedProjects = options.projectId?.trim()
    ? projects.filter((project) => project.id === options.projectId?.trim())
    : projects;

  const collected: LibraryItem[] = [];

  for (const project of scopedProjects) {
    if (collected.length >= MAX_LIBRARY_FILES) {
      break;
    }

    const workspaceRoot = project.path ?? resolveProjectWorkspaceRoot(project.id);
    const projectFiles = await collectProjectLibraryFiles(workspaceRoot, project.id, project.name);
    collected.push(...projectFiles);
  }

  let filtered = dedupeLibraryItems(collected).filter((item) => matchesQuery(item, query));

  if (kind === 'images') {
    filtered = filtered.filter((item) => item.kind === 'image');
  } else if (kind === 'files') {
    filtered = filtered.filter((item) => item.kind === 'file');
  }

  filtered = sortLibraryItems(filtered, sort, sortDir);

  return filtered.slice(0, limit);
}