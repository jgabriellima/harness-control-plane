import { r as resolveHarnessBinding } from './harness-binding_CgEjapvr.mjs';
import { d as resolveActiveWorkspaceRoot } from './workspace-manager_C2YuGzrP.mjs';

async function resolveWorkspaceHarnessBinding(options = {}) {
  const workspaceRoot = options.workspaceRoot?.trim() || options.projectRoot?.trim() || await resolveActiveWorkspaceRoot();
  return resolveHarnessBinding({ workspaceRoot });
}

export { resolveWorkspaceHarnessBinding as r };
