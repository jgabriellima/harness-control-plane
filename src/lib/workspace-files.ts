import { access, readFile, readdir, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { inferMimeFromPath, isBinaryWorkspaceFile } from './file-reference';
import { resolveHarnessBinding } from './harness-binding';
import {
  resolveControlPlaneInstallRoot,
  resolvePlatformAppRoot,
  resolveRepoRoot,
} from './repo-root';
import { resolveActiveWorkspaceRoot } from './workspace-manager';

export interface WorkspaceFileContent {
  path: string;
  content: string | null;
  mime: string;
  size: number;
  encoding: 'utf8' | 'binary';
}

export interface ResolvedWorkspaceFile {
  safePath: string;
  displayPath: string;
  mime: string;
  size: number;
}

function normalizeRequestedPath(requestedPath: string): string {
  return requestedPath.replace(/^\/+/, '').trim();
}

/** Strip @workspace/ or @project/ alias prefix from agent-supplied paths. */
export function stripWorkspacePathAlias(requestedPath: string): string {
  return requestedPath
    .trim()
    .replace(/^@(workspace|project):?\//i, '')
    .replace(/^\/+/, '');
}

/**
 * Expand bare filenames and aliases into conventional harness locations.
 * Agents often cite `business.yaml` instead of `.business/business.yaml`.
 */
export function expandWorkspacePathCandidates(
  requestedPath: string,
  harnessDirRel?: string,
): string[] {
  const normalized = stripWorkspacePathAlias(requestedPath);
  if (!normalized) {
    return [];
  }

  const candidates = [normalized];
  const harnessPrefix = harnessDirRel?.replace(/\/$/, '') ?? null;

  if (!normalized.includes('/')) {
    if (harnessPrefix) {
      candidates.push(`${harnessPrefix}/${normalized}`);
    }
    candidates.push(
      `.cursor/${normalized}`,
      `.sdlc/${normalized}`,
      `app/${normalized}`,
    );

    if (harnessPrefix && (normalized.endsWith('.yaml') || normalized.endsWith('.yml'))) {
      candidates.unshift(`${harnessPrefix}/${normalized}`);
    }

    if (normalized === '.env' || normalized === 'env') {
      candidates.unshift('.env');
    }

    candidates.push(`src/lib/${normalized}`);
  }

  return [...new Set(candidates)];
}

async function findFileByBasename(dir: string, targetBasename: string): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isFile() && entry.name === targetBasename) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const nested = await findFileByBasename(fullPath, targetBasename);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

/**
 * Agents often cite bare artifact names (`deck.html`) after playbook runs.
 * Search recent run output under harness playbooks/runs/.../artifacts trees.
 */
export async function findRecentPlaybookArtifactRelativePath(
  filename: string,
  harnessRoot: string,
): Promise<string | null> {
  const targetBasename = basename(filename.trim());
  if (!targetBasename || targetBasename.includes('/')) {
    return null;
  }

  const runsDir = join(harnessRoot, 'playbooks', 'runs');
  if (!(await fileExists(runsDir))) {
    return null;
  }

  let runEntries;
  try {
    runEntries = await readdir(runsDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const runIds = runEntries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('playbook-'))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const runId of runIds) {
    const artifactsDir = join(runsDir, runId, 'artifacts');
    const absolutePath = await findFileByBasename(artifactsDir, targetBasename);
    if (!absolutePath) {
      continue;
    }

    const harnessResolved = resolve(harnessRoot);
    const resolvedArtifact = resolve(absolutePath);
    if (
      resolvedArtifact === harnessResolved ||
      !resolvedArtifact.startsWith(`${harnessResolved}/`)
    ) {
      continue;
    }

    return resolvedArtifact.slice(harnessResolved.length + 1);
  }

  return null;
}

function assertWithinRoots(filePath: string, allowedRoots: string[]): string {
  const resolved = resolve(filePath);

  for (const root of allowedRoots) {
    if (resolved === root || resolved.startsWith(`${root}/`)) {
      return resolved;
    }
  }

  throw new Error('Path is outside workspace root');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function relativePathFromRoots(filePath: string, roots: string[], fallback: string): string {
  const resolved = resolve(filePath);

  for (const root of roots) {
    const resolvedRoot = resolve(root);
    if (resolved === resolvedRoot) {
      return '';
    }
    if (resolved.startsWith(`${resolvedRoot}/`)) {
      return resolved.slice(resolvedRoot.length + 1);
    }
  }

  return fallback;
}

export async function resolveWorkspaceFileLocation(
  requestedPath: string,
  harnessRoot?: string,
): Promise<ResolvedWorkspaceFile | null> {
  const normalizedPath = stripWorkspacePathAlias(normalizeRequestedPath(requestedPath));
  if (!normalizedPath) {
    return null;
  }

  const projectRoot = harnessRoot ?? (await resolveActiveWorkspaceRoot());
  const binding = await resolveHarnessBinding({ workspaceRoot: projectRoot });
  const harnessDirRel = binding.harnessRoot.slice(binding.workspaceRoot.length + 1);
  const repoRoot = resolveRepoRoot();
  const appRoot = resolvePlatformAppRoot();
  const controlPlaneRoot = resolveControlPlaneInstallRoot();

  const allowedRoots = [projectRoot, repoRoot, appRoot, controlPlaneRoot];
  const relativeCandidates = expandWorkspacePathCandidates(normalizedPath, harnessDirRel);

  if (!normalizedPath.includes('/')) {
    const playbookArtifact = await findRecentPlaybookArtifactRelativePath(
      normalizedPath,
      binding.harnessRoot,
    );
    if (playbookArtifact) {
      const harnessRelative = harnessDirRel
        ? `${harnessDirRel.replace(/\/$/, '')}/${playbookArtifact}`
        : playbookArtifact;
      relativeCandidates.unshift(harnessRelative);
    }
  }

  const candidates = relativeCandidates.flatMap((relativePath) => [
    resolve(projectRoot, relativePath),
    resolve(repoRoot, relativePath),
    resolve(appRoot, relativePath),
    resolve(controlPlaneRoot, relativePath),
  ]);

  for (const candidate of [...new Set(candidates)]) {
    let safePath: string;
    try {
      safePath = assertWithinRoots(candidate, allowedRoots);
    } catch {
      continue;
    }

    if (!(await fileExists(safePath))) {
      continue;
    }

    const fileStat = await stat(safePath);
    if (!fileStat.isFile()) {
      continue;
    }

    let displayPath = relativePathFromRoots(safePath, allowedRoots, normalizedPath);
    if (displayPath.startsWith('app/')) {
      displayPath = displayPath.slice(4);
    }

    return {
      safePath,
      displayPath,
      mime: inferMimeFromPath(displayPath),
      size: fileStat.size,
    };
  }

  return null;
}

export async function readWorkspaceFile(
  requestedPath: string,
  harnessRoot?: string,
): Promise<WorkspaceFileContent | null> {
  const resolved = await resolveWorkspaceFileLocation(requestedPath, harnessRoot);
  if (!resolved) {
    return null;
  }

  if (resolved.size > 2_000_000) {
    throw new Error('File exceeds maximum preview size (2MB)');
  }

  if (isBinaryWorkspaceFile(resolved.mime)) {
    return {
      path: resolved.displayPath,
      content: null,
      mime: resolved.mime,
      size: resolved.size,
      encoding: 'binary',
    };
  }

  const content = await readFile(resolved.safePath, 'utf8');

  return {
    path: resolved.displayPath,
    content,
    mime: resolved.mime,
    size: resolved.size,
    encoding: 'utf8',
  };
}
