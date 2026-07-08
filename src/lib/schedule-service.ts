import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { loadScheduleRegistry } from './harness-reader';
import { resolveHarnessBinding } from './harness-binding';
import type { ScheduleRegistryEntry } from './harness-types';
import { materializeScheduledWorkflow } from './schedule-workflow';
import { resolveActiveWorkspaceRoot } from './workspace-manager';

const execFileAsync = promisify(execFile);

async function scheduleScriptPath(): Promise<{ script: string; cwd: string }> {
  const workspaceRoot = await resolveActiveWorkspaceRoot();
  const binding = await resolveHarnessBinding({ workspaceRoot });
  return {
    script: `${binding.harnessRoot}/bin/${binding.cliPrefix}_schedule_registry.py`,
    cwd: binding.workspaceRoot,
  };
}

export interface RegisterScheduleInput {
  title: string;
  description: string;
  cron: string;
  icon?: string;
  workflowId?: string;
  entryId?: string;
}

export async function rebuildScheduleRegistry(): Promise<void> {
  const { script, cwd } = await scheduleScriptPath();
  await execFileAsync('python3', [script, 'rebuild'], { cwd, maxBuffer: 1024 * 1024 });
}

function findScheduleEntry(
  entries: ScheduleRegistryEntry[],
  workflowId: string,
  entryId?: string,
): ScheduleRegistryEntry | undefined {
  if (entryId) {
    const exact = entries.find((entry) => entry.id === entryId);
    if (exact) {
      return exact;
    }
  }

  const scheduleEntry = entries.find(
    (entry) => entry.workflowId === workflowId && entry.trigger.type === 'schedule',
  );
  if (scheduleEntry) {
    return scheduleEntry;
  }

  return entries.find((entry) => entry.workflowId === workflowId);
}

export async function registerScheduleEntry(input: RegisterScheduleInput): Promise<ScheduleRegistryEntry> {
  const materialized = await materializeScheduledWorkflow({
    title: input.title,
    description: input.description,
    cron: input.cron,
    icon: input.icon,
    workflowId: input.workflowId,
  });

  await rebuildScheduleRegistry();

  const registry = await loadScheduleRegistry();
  if (!registry) {
    throw new Error('Schedule registry missing after rebuild');
  }

  const expectedEntryId = input.entryId ?? `sched-${materialized.workflowId}-0`;
  const entry = findScheduleEntry(registry.spec.entries, materialized.workflowId, expectedEntryId);
  if (!entry) {
    throw new Error(`Schedule entry not found for workflow ${materialized.workflowId}`);
  }

  return entry;
}

export async function setScheduleEnabled(entryId: string, enabled: boolean): Promise<ScheduleRegistryEntry> {
  const { script, cwd } = await scheduleScriptPath();

  function parseJsonStdout<T>(stdout: string): T {
    const trimmed = stdout.trim();
    if (!trimmed) {
      throw new Error('Empty response from schedule registry');
    }
    return JSON.parse(trimmed) as T;
  }

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

  function parseJsonStdout<T>(stdout: string): T {
    const trimmed = stdout.trim();
    if (!trimmed) {
      throw new Error('Empty response from schedule registry');
    }
    return JSON.parse(trimmed) as T;
  }

  const { stdout } = await execFileAsync('python3', [script, 'run-now', '--entry-id', entryId], {
    cwd,
    maxBuffer: 1024 * 1024,
  });
  return parseJsonStdout<Record<string, unknown>>(stdout);
}
