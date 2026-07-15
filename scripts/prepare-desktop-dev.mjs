#!/usr/bin/env node
/**
 * Pre-flight for desktop dev: free stale listeners, pick one port, export env for child shells.
 *
 * Usage:
 *   eval "$(node scripts/prepare-desktop-dev.mjs --export)"
 *   npm run dev:desktop
 *
 * Optional blocking voice bootstrap (pip + Whisper model — slow):
 *   node scripts/prepare-desktop-dev.mjs --voice
 *
 * Or run standalone to print the chosen port:
 *   node scripts/prepare-desktop-dev.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareDevPort } from './dev-port.mjs';
import {
  applyNodeRuntimeToProcessEnv,
  discoverProjectRootFromCwd,
  ensureNodeRuntime,
  shellExportNodeRuntime,
} from './node-runtime.mjs';

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exportMode = process.argv.includes('--export');
const prepareVoice = process.argv.includes('--voice');

const discoveredProjectRoot = discoverProjectRootFromCwd();
if (discoveredProjectRoot && !process.env.CONTROL_PLANE_PROJECT_ROOT?.trim()) {
  process.env.CONTROL_PLANE_PROJECT_ROOT = discoveredProjectRoot;
}

const port = await prepareDevPort({ logPrefix: '[prepare-desktop-dev]' });

const nodeRuntime = await ensureNodeRuntime({ logPrefix: '[prepare-desktop-dev]' });
applyNodeRuntimeToProcessEnv(nodeRuntime);

// Voice transcription is provisioned lazily after first paint (see voice-transcription.ts).
// Blocking here on pip + Whisper model download adds several minutes to every dev:desktop start.
if (prepareVoice && !exportMode) {
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
    `${shellExportNodeRuntime(nodeRuntime)} export CONTROL_PLANE_PORT=${port}; export PORT=${port};`,
  );
} else {
  console.log(`CONTROL_PLANE_PORT=${port}`);
  console.log(`PORT=${port}`);
  console.log(`NODE_BINARY=${nodeRuntime.nodeBinary}`);
  console.log(`devUrl=http://localhost:${port}/`);
}
