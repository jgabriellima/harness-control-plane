#!/usr/bin/env node
/**
 * Run Astro CLI; load repo-root `.env` when present.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareDevPort } from './dev-port.mjs';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('usage: astro-cli.mjs <dev|preview|...> [args]');
  process.exit(1);
}

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const astroBin = path.join(appRoot, 'node_modules', '.bin', 'astro');

function resolvePrimaryRepoRoot(worktreeRoot) {
  const gitPath = path.join(worktreeRoot, '.git');
  if (!existsSync(gitPath)) {
    return null;
  }

  try {
    const stat = readFileSync(gitPath);
    const content = stat.toString('utf8').trim();
    const match = content.match(/^gitdir:\s*(.+)$/m);
    if (!match) {
      return null;
    }
    const gitdir = path.resolve(worktreeRoot, match[1].trim());
    return path.dirname(path.dirname(path.dirname(gitdir)));
  } catch {
    return null;
  }
}

function resolveEnvFile() {
  const localEnv = path.join(appRoot, '.env');
  if (existsSync(localEnv)) {
    return localEnv;
  }

  const repoRoot = resolvePrimaryRepoRoot(path.join(appRoot, '..'));
  if (!repoRoot) {
    return null;
  }

  const primaryEnv = path.join(repoRoot, '.env');
  return existsSync(primaryEnv) ? primaryEnv : null;
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

const envFile = resolveEnvFile();
const nodeArgs =
  envFile !== null
    ? ['--env-file', envFile, astroBin, command, ...astroArgs]
    : [astroBin, command, ...astroArgs];

const child = spawn(process.execPath, nodeArgs, {
  cwd: appRoot,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
