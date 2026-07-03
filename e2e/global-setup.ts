import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const hostRepo = resolve(process.env.CONTROL_PLANE_HOST_REPO ?? join(repoRoot, '../business-workflow'));
const platformRoot = resolve(
  process.env.CONTROL_PLANE_PLATFORM_ROOT ?? join(hostRepo, 'app'),
);

const fixtureSource = join(
  platformRoot,
  '.business/playbooks/runs/playbook-e2e-fixture',
);
const fixtureTarget = join(
  hostRepo,
  'workspaces/default/.business/playbooks/runs/playbook-e2e-fixture',
);

export default async function globalSetup(): Promise<void> {
  if (!existsSync(fixtureSource)) {
    return;
  }

  await mkdir(join(fixtureTarget, '..'), { recursive: true });
  await cp(fixtureSource, fixtureTarget, { recursive: true, force: true });
}
