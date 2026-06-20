import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { resolveHarnessBinding } from './harness-binding';
import { resolveAppRoot } from './app-root';

const execFileAsync = promisify(execFile);

export interface ActiveRunEntry {
  runId: string;
  conversationId: string;
  agentId: string;
  startedAt: string;
}

export interface RunsIndex {
  version: number;
  updatedAt: string;
  active: ActiveRunEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function runRegistryPaths(workspaceRoot?: string) {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const sessionsDir = join(binding.harnessRoot, 'runtime-sessions');
  return {
    workspaceRoot: binding.workspaceRoot,
    runsIndexPath: join(sessionsDir, 'runs-index.json'),
    runRegistryScript: join(binding.harnessRoot, 'bin', `${binding.cliPrefix}_run_registry.py`),
  };
}

export async function readRunsIndex(): Promise<RunsIndex> {
  const paths = await runRegistryPaths();
  try {
    const raw = await readFile(paths.runsIndexPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.active)) {
      return { version: 1, updatedAt: new Date().toISOString(), active: [] };
    }

    const active = parsed.active
      .filter(isRecord)
      .map((entry) => ({
        runId: typeof entry.runId === 'string' ? entry.runId : '',
        conversationId: typeof entry.conversationId === 'string' ? entry.conversationId : '',
        agentId: typeof entry.agentId === 'string' ? entry.agentId : '',
        startedAt: typeof entry.startedAt === 'string' ? entry.startedAt : '',
      }))
      .filter((entry) => entry.runId.length > 0 && entry.conversationId.length > 0);

    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      active,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, updatedAt: new Date().toISOString(), active: [] };
    }
    throw error;
  }
}

export async function appendRunStarted(input: {
  runId: string;
  conversationId: string;
  agentId: string;
  vendor?: string;
}): Promise<void> {
  const paths = await runRegistryPaths();
  await execFileAsync(
    'python3',
    [
      paths.runRegistryScript,
      'append-started',
      '--run-id',
      input.runId,
      '--conversation-id',
      input.conversationId,
      '--agent-id',
      input.agentId,
      '--vendor',
      input.vendor ?? 'cursor-local',
    ],
    { cwd: paths.workspaceRoot, maxBuffer: 1024 * 1024 },
  );
}

export async function appendRunTerminal(input: {
  runId: string;
  event: 'run.completed' | 'run.failed' | 'run.aborted';
  status?: string;
  message?: string;
  reason?: string;
}): Promise<void> {
  const paths = await runRegistryPaths();
  const args = [
    paths.runRegistryScript,
    'append-terminal',
    '--run-id',
    input.runId,
    '--event',
    input.event,
  ];

  if (input.status) {
    args.push('--status', input.status);
  }
  if (input.message) {
    args.push('--message', input.message);
  }
  if (input.reason) {
    args.push('--reason', input.reason);
  }

  await execFileAsync('python3', args, {
    cwd: paths.workspaceRoot,
    maxBuffer: 1024 * 1024,
  });
}
