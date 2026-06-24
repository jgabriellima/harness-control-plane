import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { inferMimeFromPath } from './file-reference';
import { resolveHarnessBinding } from './harness-binding';
import {
  resolveControlPlaneInstallRoot,
  resolvePlatformAppRoot,
  resolveRepoRoot,
} from './repo-root';
import { resolveActiveWorkspaceRoot } from './workspace-manager';

export interface WorkspaceFileContent {
  path: string;
  content: string;
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

export async function readWorkspaceFile(
  requestedPath: string,
  harnessRoot?: string,
): Promise<WorkspaceFileContent | null> {
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

    if (fileStat.size > 2_000_000) {
      throw new Error('File exceeds maximum preview size (2MB)');
    }

    const content = await readFile(safePath, 'utf8');
    let displayPath = relativePathFromRoots(safePath, allowedRoots, normalizedPath);

    if (displayPath.startsWith("app/")) {
      displayPath = displayPath.slice(4);
    }

    return {
      path: displayPath,
      content,
      mime: inferMimeFromPath(displayPath),
      size: fileStat.size,
    };
  }

  return null;
}
