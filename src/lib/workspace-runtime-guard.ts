import { resolve } from 'node:path';

import { resolvePlatformAppRoot } from './repo-root';
import { resolveWorkspacesContainer } from './workspaces-root';

/**
 * ADR-046: mutating harness operations (SDK dispatch, session registry, uploads)
 * MUST target a workspace under the container — never the embed shell `app/` tree.
 */
export function isUnderWorkspacesContainer(workspaceRoot: string): boolean {
  const container = resolve(resolveWorkspacesContainer());
  const normalized = resolve(workspaceRoot);
  return normalized === container || normalized.startsWith(`${container}/`);
}

export function isPlatformEmbedShell(workspaceRoot: string): boolean {
  try {
    const platformRoot = resolve(resolvePlatformAppRoot());
    return resolve(workspaceRoot) === platformRoot;
  } catch {
    return false;
  }
}

export function assertDistributedRuntimeWorkspace(
  workspaceRoot: string,
  operation: string,
): void {
  if (isPlatformEmbedShell(workspaceRoot)) {
    throw new Error(
      `${operation}: embed shell (app/) is not a runtime harness target — use workspaces/{projectId}/`,
    );
  }

  if (!isUnderWorkspacesContainer(workspaceRoot)) {
    throw new Error(
      `${operation}: workspace root must be under ${resolveWorkspacesContainer()}, got ${workspaceRoot}`,
    );
  }
}
