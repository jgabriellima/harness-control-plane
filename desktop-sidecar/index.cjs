#!/usr/bin/env node
/**
 * Tauri sidecar entry — starts Astro standalone server from bundled resources.
 * Env: TAURI_RESOURCE_DIR, TAURI_APP_PORT, HOST (default 127.0.0.1)
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const resourceDir = process.env.TAURI_RESOURCE_DIR ?? process.cwd();
const port = process.env.TAURI_APP_PORT ?? process.env.PORT ?? '4321';
const host = process.env.HOST ?? '127.0.0.1';

function resolveProjectRoot(root) {
  const nested = path.join(root, '_up_');
  if (fs.existsSync(path.join(nested, 'dist', 'server', 'entry.mjs'))) {
    return nested;
  }
  if (fs.existsSync(path.join(root, 'dist', 'server', 'entry.mjs'))) {
    return root;
  }
  return null;
}

const projectRoot = resolveProjectRoot(resourceDir);
if (!projectRoot) {
  console.error(`[business-server] dist/server/entry.mjs not found under ${resourceDir}`);
  process.exit(1);
}

const entry = path.join(projectRoot, 'dist', 'server', 'entry.mjs');
const nodeModules = path.join(projectRoot, 'node_modules');

const env = {
  ...process.env,
  HOST: host,
  PORT: String(port),
  NODE_ENV: 'production',
  CONTROL_PLANE_DESKTOP: process.env.CONTROL_PLANE_DESKTOP ?? '1',
};

if (fs.existsSync(nodeModules)) {
  env.NODE_PATH = nodeModules;
}

const child = spawn(process.execPath, [entry], {
  cwd: projectRoot,
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

process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
