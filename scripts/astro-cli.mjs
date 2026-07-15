#!/usr/bin/env node
/**
 * Run Astro CLI; load repo-root `.env` when present.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareDevPort } from './dev-port.mjs';
import {
  applyNodeRuntimeToProcessEnv,
  buildNodeRuntimeEnv,
  ensureNodeRuntime,
} from './node-runtime.mjs';
import { applyDesktopBundleEnv, resolveEnvFilePaths } from './resolve-env-files.mjs';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('usage: astro-cli.mjs <dev|preview|...> [args]');
  process.exit(1);
}

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const astroBin = path.join(appRoot, 'node_modules', '.bin', 'astro');

const nodeRuntime = await ensureNodeRuntime({ logPrefix: '[astro-cli]' });
applyNodeRuntimeToProcessEnv(nodeRuntime);

function resolveEnvFiles() {
  return resolveEnvFilePaths(appRoot);
}

const astroArgs = [...args];
if (command === 'dev' && !astroArgs.some((token) => token === '--port')) {
  const presetPort = process.env.CONTROL_PLANE_PORT?.trim() || process.env.PORT?.trim();
  if (!presetPort) {
    await prepareDevPort({ logPrefix: '[dev]' });
  }
  const port = process.env.CONTROL_PLANE_PORT?.trim() || process.env.PORT?.trim();
  if (!port) {
    console.error('[dev] CONTROL_PLANE_PORT is unset after prepareDevPort');
    process.exit(1);
  }
  astroArgs.push('--port', port);
}

const envFiles = resolveEnvFiles();
const nodeArgs = [
  ...envFiles.flatMap((envFile) => ['--env-file', envFile]),
  astroBin,
  command,
  ...astroArgs,
];

const projectRoot = process.env.CONTROL_PLANE_PROJECT_ROOT?.trim();
if (command === 'dev' && !projectRoot) {
  console.warn(
    '[dev] WARNING: CONTROL_PLANE_PROJECT_ROOT is unset. UI config, commands, and workspace binding will use the HCP repo root, not your bound app. Set e.g. CONTROL_PLANE_PROJECT_ROOT=/path/to/your/app npm run dev',
  );
}
const childEnv = applyDesktopBundleEnv(buildNodeRuntimeEnv(nodeRuntime), projectRoot);

const child = spawn(nodeRuntime.nodeBinary, nodeArgs, {
  cwd: appRoot,
  stdio: 'inherit',
  env: childEnv,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
