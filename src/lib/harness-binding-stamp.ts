import { join } from 'node:path';

import type { HarnessBinding, RuntimeBindingStamp } from './harness-binding-types';

function normalizeDir(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function joinWorkspace(workspaceRoot: string, relative: string): string {
  const trimmed = relative.replace(/^\.\//, '');
  return join(workspaceRoot, trimmed);
}

export function resolveBindingFromStamp(
  workspaceRoot: string,
  stamp: RuntimeBindingStamp,
): HarnessBinding {
  const pack = stamp.active_pack;
  const harnessDir = normalizeDir(pack.harness_dir ?? '.harness/');
  const harnessRoot = joinWorkspace(workspaceRoot, harnessDir.slice(0, -1));
  const dslFile = pack.dsl_file ?? 'harness.yaml';
  const cliPrefix = pack.cli_prefix ?? 'harness';
  const specializationLayer = normalizeDir(stamp.runtime.specialization_layer ?? '.cursor/');

  const storageResolved = stamp.storage.resolved ?? {};
  const storageRoot = normalizeDir(stamp.storage.root ?? harnessDir);

  const runsRelative = storageResolved.workflow_runs ?? join(storageRoot, 'runs/');
  const tracesRelative = storageResolved.trace ?? join(storageRoot, 'traces/');
  const workflowsRelative = join(storageRoot, 'workflows/');

  const runtimeAdapterName =
    stamp.runtime.engine === 'cursor' ? 'cursor-local' : `${stamp.runtime.engine}-local`;

  return {
    workspaceRoot,
    harnessRoot,
    dslPath: join(harnessRoot, dslFile),
    runnerScript: join(harnessRoot, 'bin', `${cliPrefix}_workflow_run.py`),
    workflowsDir: joinWorkspace(workspaceRoot, workflowsRelative),
    runsDir: joinWorkspace(workspaceRoot, runsRelative),
    tracesDir: joinWorkspace(workspaceRoot, tracesRelative),
    commandsDir: joinWorkspace(workspaceRoot, specializationLayer, 'commands'),
    commandNamespace: {
      lifecycle: pack.command_namespace?.lifecycle ?? `/${cliPrefix}:`,
      capabilities: pack.command_namespace?.capabilities ?? '/run:',
    },
    cliPrefix,
    runtimeEngine: stamp.runtime.engine,
    runtimeAdapterName,
    runtimeAdapterPath: join(harnessRoot, 'runtime-adapters', `${runtimeAdapterName}.yaml`),
    specializationLayer: joinWorkspace(workspaceRoot, specializationLayer.slice(0, -1)),
    source: 'runtime-binding',
  };
}
