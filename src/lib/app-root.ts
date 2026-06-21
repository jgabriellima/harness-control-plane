import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { hasRuntimeBindingStamp } from './harness-binding';
import { resolvePlatformAppRoot } from './repo-root';

/**
 * Resolve the platform orchestration app root (SSR shell under `app/`).
 * For per-project harness paths use `resolveActiveWorkspaceRoot()` from workspace-manager.
 */
export function resolveAppRoot(projectRoot?: string): string {
  const candidates = [
    process.cwd(),
    join(process.cwd(), '..'),
    join(process.cwd(), '../..'),
    join(process.cwd(), '../../..'),
  ];

  for (const candidate of candidates) {
    if (hasRuntimeBindingStamp(candidate)) {
      return candidate;
    }
  }

  return resolvePlatformAppRoot(projectRoot);
}

/**
 * Workspace directory for harness resolution (binding resolves harnessRoot separately).
 */
export function resolveHarnessRoot(workspaceRoot: string): string {
  return workspaceRoot;
}
