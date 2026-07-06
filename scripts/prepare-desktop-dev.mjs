#!/usr/bin/env node
/**
 * Pre-flight for desktop dev: free stale listeners, pick one port, export env for child shells.
 *
 * Usage:
 *   eval "$(node scripts/prepare-desktop-dev.mjs --export)"
 *   npm run dev:desktop
 *
 * Or run standalone to print the chosen port:
 *   node scripts/prepare-desktop-dev.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareDevPort } from './dev-port.mjs';

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exportMode = process.argv.includes('--export');
const skipVoice = process.argv.includes('--skip-voice');
const port = await prepareDevPort({ logPrefix: '[prepare-desktop-dev]' });

if (!skipVoice && !exportMode) {
  const { spawnSync } = await import('node:child_process');
  const ensure = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/ensure-voice-transcription.mjs'],
    {
      cwd: harnessRoot,
      stdio: 'inherit',
      env: process.env,
    },
  );
  if (ensure.status !== 0) {
    process.exit(ensure.status ?? 1);
  }
}

if (exportMode) {
  process.stdout.write(
    `export CONTROL_PLANE_PORT=${port}; export PORT=${port};`,
  );
} else {
  console.log(`CONTROL_PLANE_PORT=${port}`);
  console.log(`PORT=${port}`);
  console.log(`devUrl=http://localhost:${port}/`);
}
