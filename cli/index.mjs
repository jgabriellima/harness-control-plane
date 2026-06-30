#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import 'tsx/esm/api';
import { parse as parseYaml } from 'yaml';

function parseArgs(argv) {
  const positional = [];
  let projectRoot;
  let verbose = false;
  let passthrough = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') {
      passthrough = argv.slice(index + 1);
      break;
    }
    if (token === '--verbose') {
      verbose = true;
      continue;
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

  return { positional, projectRoot, verbose, passthrough };
}

async function loadCoreModules() {
  const [projectRootModule, uiConfigModule] = await Promise.all([
    import('../src/lib/project-root.ts'),
    import('../src/lib/ui-config.ts'),
  ]);

  return {
    resolveProjectRoot: projectRootModule.resolveProjectRoot,
    loadUIConfig: uiConfigModule.loadUIConfig,
    uiConfigPath: uiConfigModule.uiConfigPath,
  };
}

function assertRuntimeBinding(projectRoot) {
  const bindingPath = join(projectRoot, '.cursor', 'runtime-binding.yaml');
  if (!existsSync(bindingPath)) {
    throw new Error(`Missing ${bindingPath}`);
  }

  const doc = parseYaml(readFileSync(bindingPath, 'utf8'));
  if (doc?.apiVersion !== 'proc.jambu/v1' || doc?.kind !== 'RuntimeBinding') {
    throw new Error('runtime-binding.yaml must be proc.jambu/v1 RuntimeBinding');
  }

  const harnessDir = doc?.active_pack?.harness_dir;
  if (typeof harnessDir !== 'string' || harnessDir.trim().length === 0) {
    throw new Error('runtime-binding.yaml active_pack.harness_dir must be defined');
  }

  const harnessRoot = resolve(projectRoot, harnessDir);
  if (!existsSync(harnessRoot)) {
    throw new Error(`Harness directory not found: ${harnessRoot}`);
  }

  return {
    runtimeBindingPath: bindingPath,
    harnessRoot,
  };
}

function cliUsage() {
  return [
    'Usage:',
    '  hcp start [--project-root <path>] [-- <dev args>]',
    '  hcp doctor [--project-root <path>] [--verbose]',
  ].join('\n');
}

async function commandDoctor(projectRootArg, verbose) {
  const core = await loadCoreModules();
  const projectRoot = core.resolveProjectRoot({ projectRoot: projectRootArg });
  const [uiConfig] = await Promise.all([core.loadUIConfig(projectRoot)]);
  const runtime = assertRuntimeBinding(projectRoot);

  console.log(`projectRoot: ${projectRoot}`);
  console.log(`runtimeBinding: ${runtime.runtimeBindingPath}`);
  console.log(`harnessRoot: ${runtime.harnessRoot}`);
  console.log(`uiConfig: ${core.uiConfigPath(projectRoot)}`);
  console.log(`surface: ${uiConfig.distribution?.surface ?? 'embedded'}`);

  if (verbose) {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dispatchLogPath = join(runtime.harnessRoot, 'runtime-sessions', 'dispatch-log.jsonl');
    const runsLogPath = join(runtime.harnessRoot, 'runtime-sessions', 'runs.jsonl');

    console.log('--- observability ---');
    console.log(`CURSOR_API_KEY: ${process.env.CURSOR_API_KEY?.trim() ? 'present' : 'missing'}`);
    console.log(`SENTRY_DSN: ${process.env.SENTRY_DSN?.trim() ? 'present' : 'missing'}`);
    console.log(
      `CONTROL_PLANE_LOG_LEVEL: ${process.env.CONTROL_PLANE_LOG_LEVEL?.trim() || 'debug (dev default)'}`,
    );
    console.log(`dispatch_log: ${dispatchLogPath}`);

    if (existsSync(dispatchLogPath)) {
      const lines = readFileSync(dispatchLogPath, 'utf8').trim().split('\n').filter(Boolean);
      const failures = lines
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(
          (entry) =>
            entry &&
            (entry.event === 'chat.sdk.dispatch.error' ||
              entry.event === 'chat.response.error' ||
              entry.event === 'chat.fanout.error'),
        )
        .slice(-5);
      if (failures.length > 0) {
        console.log('recent dispatch failures:');
        for (const failure of failures) {
          console.log(
            `  ${failure.ts} ${failure.event} phase=${failure.phase ?? '-'} ${failure.error_message ?? failure.detail ?? ''}`,
          );
        }
      } else {
        console.log('recent dispatch failures: none');
      }
    } else {
      console.log('recent dispatch failures: dispatch-log.jsonl not found');
    }

    if (existsSync(runsLogPath)) {
      const registryFailures = readFileSync(runsLogPath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((entry) => entry?.event === 'run.failed')
        .slice(-5);
      if (registryFailures.length > 0) {
        console.log('recent registry failures:');
        for (const failure of registryFailures) {
          console.log(`  ${failure.ts} ${failure.runId} ${failure.message ?? ''}`);
        }
      }
    }
  }

  console.log('doctor: ok');
}

async function commandStart(projectRootArg, passthroughArgs) {
  const { createHarnessUI } = await import('../embed/index.mjs');
  const ui = await createHarnessUI({ projectRoot: projectRootArg });
  const exitCode = await ui.start({
    surface: ui.uiConfig.distribution?.surface ?? 'web',
    passthroughArgs,
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
    await commandDoctor(parsed.projectRoot, parsed.verbose);
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
