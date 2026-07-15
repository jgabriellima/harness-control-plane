#!/usr/bin/env node
/**
 * Desktop dev orchestrator: prepare ports, sidecar stub, Tauri with matching devUrl.
 */
import fs, { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareDevPort } from './dev-port.mjs';
import {
  applyNodeRuntimeToProcessEnv,
  buildNodeRuntimeEnv,
  discoverProjectRootFromCwd,
  ensureNodeRuntime,
} from './node-runtime.mjs';
import { warmRustDevBuild } from './warm-rust-dev.mjs';
import { applyEnvFilesToRecord, applyDesktopBundleEnv, resolveEnvFilePaths } from './resolve-env-files.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const devHost = process.env.CONTROL_PLANE_HOST ?? '127.0.0.1';

const discoveredProjectRoot = discoverProjectRootFromCwd();
if (discoveredProjectRoot && !process.env.CONTROL_PLANE_PROJECT_ROOT?.trim()) {
  process.env.CONTROL_PLANE_PROJECT_ROOT = discoveredProjectRoot;
}

const nodeRuntime = await ensureNodeRuntime({ logPrefix: '[tauri-dev]' });
applyNodeRuntimeToProcessEnv(nodeRuntime);
await warmRustDevBuild({ logPrefix: '[tauri-dev]', harnessRoot: appRoot });

function runMergeBranding(env) {
  const args = ['scripts/merge-tauri-branding.mjs'];
  const projectRoot = env.CONTROL_PLANE_PROJECT_ROOT?.trim();
  if (projectRoot) {
    args.push('--project-root', projectRoot);
  }

  const result = spawnSync(process.execPath, args, {
    cwd: appRoot,
    env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function readMergedDesktopBranding(appRoot) {
  const tauriConfPath = path.join(appRoot, 'src-tauri', 'tauri.conf.json');
  const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'));
  const productName = tauriConf.productName ?? 'Control Plane';
  const title = tauriConf.app?.windows?.[0]?.title ?? productName;
  return { productName, title };
}

const port = await prepareDevPort({ logPrefix: '[tauri-dev]' });
const devUrl = `http://${devHost}:${port}/`;

console.log(`[tauri-dev] devUrl=${devUrl}`);

const env = buildNodeRuntimeEnv(nodeRuntime, {
  ...process.env,
  CONTROL_PLANE_HOST: devHost,
  CONTROL_PLANE_PORT: String(port),
  PORT: String(port),
  CONTROL_PLANE_DESKTOP: '1',
  TAURI_ENV: 'dev',
});

for (const envPath of resolveEnvFilePaths(appRoot)) {
  applyEnvFilesToRecord(env, [envPath]);
}

runMergeBranding(env);

const projectRoot = env.CONTROL_PLANE_PROJECT_ROOT?.trim();
Object.assign(env, applyDesktopBundleEnv(env, projectRoot));

const { productName, title: windowTitle } = readMergedDesktopBranding(appRoot);

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
  productName,
  app: {
    security: {
      devCsp: null,
    },
    windows: [
      {
        label: 'main',
        title: windowTitle,
        devtools: true,
      },
    ],
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
