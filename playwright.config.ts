import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4321);
const baseURL = `http://127.0.0.1:${port}`;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const defaultPlatformRoot = path.resolve(repoRoot, '../business-workflow/app');

const platformRoot =
  process.env.CONTROL_PLANE_PLATFORM_ROOT?.trim() ??
  (existsSync(path.join(defaultPlatformRoot, '.cursor', 'runtime-binding.yaml'))
    ? defaultPlatformRoot
    : repoRoot);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 120_000,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: process.env.CI
      ? `npm run build && npm run dev -- --host 127.0.0.1 --port ${port}`
      : `npm run dev -- --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    cwd: '.',
    timeout: 300_000,
    env: {
      ...process.env,
      CONTROL_PLANE_PLATFORM_ROOT: platformRoot,
      CONTROL_PLANE_HOST_REPO: path.resolve(repoRoot, '../business-workflow'),
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
