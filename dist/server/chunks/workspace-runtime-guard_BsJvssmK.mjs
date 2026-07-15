import { resolve } from 'node:path';
import { a as resolvePlatformAppRoot } from './harness-binding_CgEjapvr.mjs';
import { k as resolveWorkspacesContainer } from './workspace-manager_C2YuGzrP.mjs';

function isUnderWorkspacesContainer(workspaceRoot) {
  const container = resolve(resolveWorkspacesContainer());
  const normalized = resolve(workspaceRoot);
  return normalized === container || normalized.startsWith(`${container}/`);
}
function isPlatformEmbedShell(workspaceRoot) {
  try {
    const platformRoot = resolve(resolvePlatformAppRoot());
    return resolve(workspaceRoot) === platformRoot;
  } catch {
    return false;
  }
}
function assertDistributedRuntimeWorkspace(workspaceRoot, operation) {
  if (isPlatformEmbedShell(workspaceRoot)) {
    throw new Error(
      `${operation}: embed shell (app/) is not a runtime harness target — use workspaces/{projectId}/`
    );
  }
  if (!isUnderWorkspacesContainer(workspaceRoot)) {
    throw new Error(
      `${operation}: workspace root must be under ${resolveWorkspacesContainer()}, got ${workspaceRoot}`
    );
  }
}

export { assertDistributedRuntimeWorkspace as a };
