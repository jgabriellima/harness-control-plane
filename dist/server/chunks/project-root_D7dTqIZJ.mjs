import { resolve } from 'node:path';

function resolveProjectRoot(options = {}) {
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

export { resolveProjectRoot as r };
