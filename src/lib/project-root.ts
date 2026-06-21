import { resolve } from 'node:path';

export interface ResolveProjectRootOptions {
  projectRoot?: string;
}

/**
 * ADR-040 project directory resolver.
 *
 * Resolution priority:
 * 1) Explicit injected `projectRoot` (CLI flag / integrator)
 * 2) `CONTROL_PLANE_PROJECT_ROOT` environment variable
 * 3) Current working directory (operator model: `cd {projectRoot} && hcp start`)
 */
export function resolveProjectRoot(options: ResolveProjectRootOptions = {}): string {
  const explicitRoot = options.projectRoot?.trim();
  if (explicitRoot) {
    return resolve(explicitRoot);
  }

  const envRoot = process.env.CONTROL_PLANE_PROJECT_ROOT?.trim();
  if (envRoot) {
    return resolve(envRoot);
  }

  return resolve(process.cwd());
}
