#!/usr/bin/env node
/**
 * Tauri beforeBuildCommand — skip redundant Astro build when bundle pipeline
 * already compiled dist/ and staged resources (CONTROL_PLANE_PROJECT_ROOT set).
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const harnessRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function distReady() {
  return (
    existsSync(join(harnessRoot, 'dist', 'server', 'entry.mjs')) &&
    existsSync(join(harnessRoot, 'dist', 'client'))
  );
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: harnessRoot, stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const bundlePrepared = process.env.BUNDLE_BUILD_PREPARED === '1';

if (bundlePrepared) {
  console.log('[before-tauri-build] skipped — bundle pipeline already prepared');
  process.exit(0);
}

const skipAstro =
  Boolean(process.env.CONTROL_PLANE_PROJECT_ROOT?.trim()) && distReady();

if (skipAstro) {
  console.log('[before-tauri-build] dist ready — skipping astro build');
} else {
  run('npm', ['run', 'build']);
}

run('node', ['desktop-sidecar/build.mjs']);
run('npm', ['run', 'desktop:merge-branding']);
