import { resolveHarnessBinding, type ResolveHarnessBindingOptions } from './harness-binding';
import type { HarnessBinding } from './harness-binding-types';
import { resolveActiveWorkspaceRoot } from './workspace-manager';

/**
 * Resolve harness binding for runtime workspaces — never the embed-shell mirror.
 * Defaults to the active distributed workspace (workspaces/{projectId}/).
 */
export async function resolveWorkspaceHarnessBinding(
  options: ResolveHarnessBindingOptions = {},
): Promise<HarnessBinding> {
  const workspaceRoot =
    options.workspaceRoot?.trim() ||
    options.projectRoot?.trim() ||
    (await resolveActiveWorkspaceRoot());
  return resolveHarnessBinding({ workspaceRoot });
}
