import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveHarnessBinding } from './harness-binding';
import { readDispatchLogForRun, readRecentDispatchFailures, type DispatchLogRecord } from './runtime-dispatch-log';
import { readRunsIndex } from './runtime-run-registry';
import { getRuntimeRunEntry } from './runtime-sessions';

export interface RunDiagnostics {
  run_id: string;
  generated_at: string;
  in_memory: boolean;
  active_index: boolean;
  dispatch_events: DispatchLogRecord[];
  registry_events: Array<Record<string, unknown>>;
  last_error: {
    phase?: string;
    message?: string;
    request_id?: string;
    ts?: string;
  } | null;
}

async function readRegistryEventsForRun(
  runId: string,
  workspaceRoot?: string,
): Promise<Array<Record<string, unknown>>> {
  try {
    const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
    const runsPath = join(binding.harnessRoot, 'runtime-sessions', 'runs.jsonl');
    const raw = await readFile(runsPath, 'utf8');
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((event) => event.runId === runId);
  } catch {
    return [];
  }
}

export async function collectRunDiagnostics(
  runId: string,
  workspaceRoot?: string,
): Promise<RunDiagnostics> {
  const [dispatchEvents, registryEvents, runsIndex] = await Promise.all([
    readDispatchLogForRun(runId, workspaceRoot),
    readRegistryEventsForRun(runId, workspaceRoot),
    readRunsIndex(workspaceRoot),
  ]);

  const inMemory = Boolean(getRuntimeRunEntry(runId));
  const activeIndex = runsIndex.active.some((entry) => entry.runId === runId);

  const errorEvent =
    [...dispatchEvents]
      .reverse()
      .find(
        (entry) =>
          entry.event === 'chat.sdk.dispatch.error' ||
          entry.event === 'chat.response.error' ||
          entry.event === 'chat.fanout.error',
      ) ??
    null;

  const failedRegistry = registryEvents.find((event) => event.event === 'run.failed');

  return {
    run_id: runId,
    generated_at: new Date().toISOString(),
    in_memory: inMemory,
    active_index: activeIndex,
    dispatch_events: dispatchEvents,
    registry_events: registryEvents,
    last_error: errorEvent
      ? {
          phase: errorEvent.phase,
          message: errorEvent.error_message ?? errorEvent.detail,
          request_id: errorEvent.request_id,
          ts: errorEvent.ts,
        }
      : failedRegistry
        ? {
            message: typeof failedRegistry.message === 'string' ? failedRegistry.message : undefined,
            ts: typeof failedRegistry.ts === 'string' ? failedRegistry.ts : undefined,
          }
        : null,
  };
}

export async function collectRuntimeHealthSnapshot(workspaceRoot?: string): Promise<{
  generated_at: string;
  cursor_api_key: 'present' | 'missing';
  recent_failures: DispatchLogRecord[];
  active_runs: number;
}> {
  const [recentFailures, runsIndex] = await Promise.all([
    readRecentDispatchFailures(5, workspaceRoot),
    readRunsIndex(workspaceRoot),
  ]);

  return {
    generated_at: new Date().toISOString(),
    cursor_api_key: process.env.CURSOR_API_KEY?.trim() ? 'present' : 'missing',
    recent_failures: recentFailures,
    active_runs: runsIndex.active.length,
  };
}
