import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { resolveProjectRoot } from './project-root';

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
 * Platform workspace root (ADR-040 `projectRoot`) — directory containing
 * `.cursor/runtime-binding.yaml`.
 *
 * Primary source is the injected/root-resolved project root.
 * `CONTROL_PLANE_PLATFORM_ROOT` is kept only as a legacy fallback.
 */
export function resolvePlatformAppRoot(projectRoot?: string): string {
  const resolvedProjectRoot = resolveProjectRoot({ projectRoot });
  if (existsSync(join(resolvedProjectRoot, '.cursor', 'runtime-binding.yaml'))) {
    return resolvedProjectRoot;
  }

  const legacyOverride = process.env.CONTROL_PLANE_PLATFORM_ROOT?.trim();
  if (legacyOverride) {
    const legacyRoot = resolve(legacyOverride);
    if (existsSync(join(legacyRoot, '.cursor', 'runtime-binding.yaml'))) {
      return legacyRoot;
    }
  }

  for (const candidate of walkCandidates()) {
    if (existsSync(join(candidate, '.cursor', 'runtime-binding.yaml'))) {
      return resolve(candidate);
    }
  }

  throw new Error(
    `Platform workspace not found for projectRoot ${resolvedProjectRoot}: missing .cursor/runtime-binding.yaml`,
  );
}

/** @deprecated Use resolveHostRepoRoot — kept for transitional imports */
export function resolveRepoRoot(): string {
  return resolveHostRepoRoot();
}
