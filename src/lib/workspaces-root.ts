import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { resolveHostRepoRoot } from './repo-root';

function expandHome(pathValue: string): string {
  return pathValue.startsWith('~/') ? join(homedir(), pathValue.slice(2)) : pathValue;
}

/**
 * Container directory for all project workspaces (ADR-039 Tier 2).
 *
 * Priority:
 * 1. CONTROL_PLANE_WORKSPACES_ROOT (or legacy BUSINESS_WORKSPACES_ROOT)
 * 2. `{host-repo}/workspaces/` when host repo is an SDLC checkout
 * 3. `~/jambu/workspaces/` standalone install default
 */
export function resolveWorkspacesContainer(): string {
  const override =
    process.env.CONTROL_PLANE_WORKSPACES_ROOT?.trim() ??
    process.env.BUSINESS_WORKSPACES_ROOT?.trim();
  if (override) {
    return resolve(expandHome(override));
  }

  const hostRepo = resolveHostRepoRoot();
  if (existsSync(join(hostRepo, '.sdlc', 'sdlc.yaml'))) {
    return join(hostRepo, 'workspaces');
  }

  return join(homedir(), 'jambu', 'workspaces');
}

export async function ensureWorkspacesContainer(): Promise<string> {
  const container = resolveWorkspacesContainer();
  await mkdir(container, { recursive: true });
  return container;
}

export function resolveWorkspacePath(projectId: string): string {
  return join(resolveWorkspacesContainer(), projectId);
}
