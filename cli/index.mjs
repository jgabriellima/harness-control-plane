#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';

function parseArgs(argv) {
  const positional = [];
  let projectRoot;
  let passthrough = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') {
      passthrough = argv.slice(index + 1);
      break;
    }
    if (token === '--project-root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--project-root requires a value');
      }
      projectRoot = value;
      index += 1;
      continue;
    }
    positional.push(token);
  }

  return { positional, projectRoot, passthrough };
}

function resolveProjectRoot(projectRootArg) {
  if (projectRootArg && projectRootArg.trim().length > 0) {
    return resolve(projectRootArg.trim());
  }
  const envRoot = process.env.CONTROL_PLANE_PROJECT_ROOT?.trim();
  if (envRoot) {
    return resolve(envRoot);
  }
  return resolve(process.cwd());
}

function loadYaml(filePath) {
  return parseYaml(readFileSync(filePath, 'utf8'));
}

function assertRuntimeBinding(projectRoot) {
  const runtimeBindingPath = join(projectRoot, '.cursor', 'runtime-binding.yaml');
  if (!existsSync(runtimeBindingPath)) {
    throw new Error(`Missing ${runtimeBindingPath}`);
  }
  const doc = loadYaml(runtimeBindingPath);
  if (doc?.apiVersion !== 'proc.jambu/v1' || doc?.kind !== 'RuntimeBinding') {
    throw new Error('runtime-binding.yaml must be proc.jambu/v1 RuntimeBinding');
  }
  const harnessDir = doc?.active_pack?.harness_dir;
  if (typeof harnessDir !== 'string' || harnessDir.trim().length === 0) {
    throw new Error('runtime-binding.yaml active_pack.harness_dir must be defined');
  }
  const resolvedHarnessRoot = resolve(projectRoot, harnessDir);
  if (!existsSync(resolvedHarnessRoot)) {
    throw new Error(`Harness directory not found: ${resolvedHarnessRoot}`);
  }
  return {
    runtimeBindingPath,
    harnessRoot: resolvedHarnessRoot,
  };
}

function assertUiConfig(projectRoot) {
  const uiConfigPath = join(projectRoot, 'ui.config.yaml');
  if (!existsSync(uiConfigPath)) {
    throw new Error(`Missing ${uiConfigPath}`);
  }
  const doc = loadYaml(uiConfigPath);
  if (doc?.apiVersion !== 'proc.jambu/v1' || doc?.kind !== 'ControlPlaneUI') {
    throw new Error('ui.config.yaml must be proc.jambu/v1 ControlPlaneUI');
  }
  const surface = doc?.distribution?.surface;
  if (
    surface !== undefined &&
    surface !== 'web' &&
    surface !== 'desktop' &&
    surface !== 'embedded'
  ) {
    throw new Error('ui.config.yaml distribution.surface must be web|desktop|embedded');
  }
  return {
    uiConfigPath,
    surface: surface ?? 'embedded',
  };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options,
    });
    child.on('error', rejectPromise);
    child.on('exit', (code, signal) => {
      if (signal) {
        rejectPromise(new Error(`Process terminated by signal ${signal}`));
        return;
      }
      resolvePromise(code ?? 0);
    });
  });
}

function cliUsage() {
  return [
    'Usage:',
    '  hcp start [--project-root <path>] [-- <dev args>]',
    '  hcp doctor [--project-root <path>]',
  ].join('\n');
}

async function commandDoctor(projectRootArg) {
  const projectRoot = resolveProjectRoot(projectRootArg);
  const runtime = assertRuntimeBinding(projectRoot);
  const ui = assertUiConfig(projectRoot);

  console.log(`projectRoot: ${projectRoot}`);
  console.log(`runtimeBinding: ${runtime.runtimeBindingPath}`);
  console.log(`harnessRoot: ${runtime.harnessRoot}`);
  console.log(`uiConfig: ${ui.uiConfigPath}`);
  console.log(`surface: ${ui.surface}`);
  console.log('doctor: ok');
}

async function commandStart(projectRootArg, passthroughArgs) {
  const projectRoot = resolveProjectRoot(projectRootArg);
  const ui = assertUiConfig(projectRoot);
  assertRuntimeBinding(projectRoot);

  const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const env = {
    ...process.env,
    CONTROL_PLANE_PROJECT_ROOT: projectRoot,
  };

  if (ui.surface === 'desktop') {
    const exitCode = await runCommand('npm', ['run', 'tauri:dev', ...passthroughArgs], {
      cwd: repoRoot,
      env,
    });
    process.exit(exitCode);
  }

  const exitCode = await runCommand('npm', ['run', 'dev', '--', ...passthroughArgs], {
    cwd: repoRoot,
    env,
  });
  process.exit(exitCode);
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(cliUsage());
    process.exit(1);
    return;
  }

  const [command] = parsed.positional;
  if (!command || command === '--help' || command === 'help') {
    console.log(cliUsage());
    process.exit(command ? 0 : 1);
    return;
  }

  if (command === 'doctor') {
    await commandDoctor(parsed.projectRoot);
    return;
  }

  if (command === 'start') {
    await commandStart(parsed.projectRoot, parsed.passthrough);
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.error(cliUsage());
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
