#!/usr/bin/env node
/**
 * Desktop dev orchestrator: prepare ports, sidecar stub, Tauri with matching devUrl.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareDevPort } from './dev-port.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const devHost = process.env.CONTROL_PLANE_HOST ?? '127.0.0.1';

const port = await prepareDevPort({ logPrefix: '[tauri-dev]' });
const devUrl = `http://${devHost}:${port}/`;

console.log(`[tauri-dev] devUrl=${devUrl}`);

const env = {
  ...process.env,
  CONTROL_PLANE_HOST: devHost,
  CONTROL_PLANE_PORT: String(port),
  PORT: String(port),
  CONTROL_PLANE_DESKTOP: '1',
};

const sidecar = spawn(process.execPath, [path.join(appRoot, 'desktop-sidecar', 'build.mjs')], {
  cwd: appRoot,
  env,
  stdio: 'inherit',
});

const sidecarCode = await new Promise((resolve) => {
  sidecar.on('exit', (code) => resolve(code ?? 1));
});

if (sidecarCode !== 0) {
  process.exit(sidecarCode);
}

const tauriBin = path.join(appRoot, 'node_modules', '.bin', 'tauri');
// Do not set app.windows[].url in dev — Tauri loads build.devUrl; an explicit url
// overrides window dimensions and can leave the webview on about:blank.
const configOverride = JSON.stringify({
  build: {
    devUrl,
  },
  app: {
    security: {
      devCsp: null,
    },
  },
});

const child = spawn(tauriBin, ['dev', '--config', configOverride], {
  cwd: appRoot,
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
