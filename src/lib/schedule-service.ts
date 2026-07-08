import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { resolveHarnessBinding } from './harness-binding';
import type { ScheduleRegistryEntry } from './harness-types';
import { resolveActiveWorkspaceRoot } from './workspace-manager';

const execFileAsync = promisify(execFile);

const DEFAULT_WORKFLOW_ID = 'scheduled-task';

async function scheduleScriptPath(): Promise<{ script: string; cwd: string }> {
  const workspaceRoot = await resolveActiveWorkspaceRoot();
  const binding = await resolveHarnessBinding({ workspaceRoot });
  return {
    script: `${binding.harnessRoot}/bin/${binding.cliPrefix}_schedule_registry.py`,
    cwd: binding.workspaceRoot,
  };
}

function parseJsonStdout<T>(stdout: string): T {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('Empty response from schedule registry');
  }
  return JSON.parse(trimmed) as T;
}

export interface RegisterScheduleInput {
  title: string;
  description: string;
  cron: string;
  icon?: string;
  workflowId?: string;
  entryId?: string;
}

export async function registerScheduleEntry(input: RegisterScheduleInput): Promise<ScheduleRegistryEntry> {
  const { script, cwd } = await scheduleScriptPath();
  const workflowId = input.workflowId ?? DEFAULT_WORKFLOW_ID;
  const intentTemplate = input.description.trim();

  const args = [
    script,
    'register',
    '--workflow-id',
    workflowId,
    '--schedule',
    input.cron,
    '--title',
    input.title,
    '--description',
    input.description,
    '--icon',
    input.icon ?? 'calendar',
    '--intent-template',
    intentTemplate,
  ];

  if (input.entryId) {
    args.push('--entry-id', input.entryId);
  }

  const { stdout } = await execFileAsync('python3', args, { cwd, maxBuffer: 1024 * 1024 });
  return parseJsonStdout<ScheduleRegistryEntry>(stdout);
}

export async function setScheduleEnabled(entryId: string, enabled: boolean): Promise<ScheduleRegistryEntry> {
  const { script, cwd } = await scheduleScriptPath();
  const command = enabled ? 'enable' : 'disable';
  const { stdout } = await execFileAsync('python3', [script, command, '--entry-id', entryId], {
    cwd,
    maxBuffer: 1024 * 1024,
  });
  return parseJsonStdout<ScheduleRegistryEntry>(stdout);
}

export async function deleteScheduleEntry(entryId: string): Promise<void> {
  const { script, cwd } = await scheduleScriptPath();
  await execFileAsync('python3', [script, 'delete', '--entry-id', entryId], {
    cwd,
    maxBuffer: 1024 * 1024,
  });
}

export async function runScheduleNow(entryId: string): Promise<Record<string, unknown>> {
  const { script, cwd } = await scheduleScriptPath();
  const { stdout } = await execFileAsync('python3', [script, 'run-now', '--entry-id', entryId], {
    cwd,
    maxBuffer: 1024 * 1024,
  });
  return parseJsonStdout<Record<string, unknown>>(stdout);
}
