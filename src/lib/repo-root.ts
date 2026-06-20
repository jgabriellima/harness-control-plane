import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

function walkCandidates(): string[] {
  return [
    process.cwd(),
    join(process.cwd(), '..'),
    join(process.cwd(), '../..'),
    join(process.cwd(), '../../..'),
  ];
}

/**
 * Optional host repo root (product repo that owns a dogfood workspace).
 * Used for `{repo}/workspaces/` dev layout — not the control plane install root.
 */
export function resolveHostRepoRoot(): string {
  const override =
    process.env.CONTROL_PLANE_HOST_REPO?.trim() ?? process.env.BUSINESS_REPO_ROOT?.trim();
  if (override) {
    return resolve(override);
  }

  for (const candidate of walkCandidates()) {
    if (existsSync(join(candidate, '.sdlc', 'sdlc.yaml'))) {
      return resolve(candidate);
    }
  }

  return resolve(process.cwd());
}

/**
 * Platform workspace root — directory containing `.cursor/runtime-binding.yaml`.
 * Set `CONTROL_PLANE_PLATFORM_ROOT` when the shell runs outside the bound workspace.
 */
export function resolvePlatformAppRoot(): string {
  const override = process.env.CONTROL_PLANE_PLATFORM_ROOT?.trim();
  if (override) {
    return resolve(override);
  }

  for (const candidate of walkCandidates()) {
    if (existsSync(join(candidate, '.cursor', 'runtime-binding.yaml'))) {
      return resolve(candidate);
    }
  }

  const siblingDogfood = resolve(process.cwd(), '../business-workflow/app');
  if (existsSync(join(siblingDogfood, '.cursor', 'runtime-binding.yaml'))) {
    return siblingDogfood;
  }

  throw new Error(
    'Platform workspace not found. Set CONTROL_PLANE_PLATFORM_ROOT to a directory with .cursor/runtime-binding.yaml',
  );
}

/** @deprecated Use resolveHostRepoRoot — kept for transitional imports */
export function resolveRepoRoot(): string {
  return resolveHostRepoRoot();
}
