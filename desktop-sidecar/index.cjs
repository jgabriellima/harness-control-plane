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

const serverDir = path.join(resourceDir, 'dist', 'server');
const entry = path.join(serverDir, 'entry.mjs');

if (!fs.existsSync(entry)) {
  console.error(`[business-server] entry not found: ${entry}`);
  process.exit(1);
}

const env = {
  ...process.env,
  HOST: host,
  PORT: String(port),
  NODE_ENV: 'production',
};

const child = spawn(process.execPath, [entry], {
  cwd: serverDir,
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
