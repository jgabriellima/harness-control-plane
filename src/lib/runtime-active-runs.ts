import {
  readAggregatedActiveRuns,
  type ActiveRunEntry,
  type RunsIndex,
} from './runtime-run-registry';
import {
  buildRunSessionSnapshot,
  loadRunSessionLifecyclePolicy,
  type RunSessionSnapshot,
} from './runtime-run-session-policy';
import { getActiveRunIds, getRuntimeRunEntry } from './runtime-sessions';
import { isRunExecutingInProcessSession, markRunExecutingInProcessSession } from './runtime-process-session';

export type { RunSessionSnapshot, ContinuableRunEntry, RunSessionLifecyclePolicy } from './runtime-run-session-policy';

/** Runs registered in this Astro process — authoritative while the dev server is alive. */
export function listInMemoryActiveRunEntries(): ActiveRunEntry[] {
  const entries: ActiveRunEntry[] = [];

  for (const runId of getActiveRunIds()) {
    const entry = getRuntimeRunEntry(runId);
    if (!entry?.conversationId || !entry.agentId) {
      continue;
    }

    entries.push({
      runId,
      conversationId: entry.conversationId,
      agentId: entry.agentId,
      startedAt: new Date().toISOString(),
    });
  }

  return entries;
}

export function mergeActiveRunEntries(disk: ActiveRunEntry[], memory: ActiveRunEntry[]): ActiveRunEntry[] {
  const byRunId = new Map<string, ActiveRunEntry>();

  for (const entry of disk) {
    byRunId.set(entry.runId, entry);
  }

  for (const entry of memory) {
    byRunId.set(entry.runId, entry);
  }

  return [...byRunId.values()].sort(
    (left, right) => right.startedAt.localeCompare(left.startedAt),
  );
}

/**
 * Authoritative run presence for UI — applies DSL session-boundary rules from business.yaml.
 *
 * Disk-indexed runs that predate this process session are `continuable`, not `executing`.
 * Only runs started (or explicitly resumed) in this session appear under `executing`.
 */
export async function readRunSessionSnapshot(): Promise<RunSessionSnapshot> {
  const disk = await readAggregatedActiveRuns();
  const memory = listInMemoryActiveRunEntries();
  const merged = mergeActiveRunEntries(disk.active, memory);

  for (const entry of memory) {
    markRunExecutingInProcessSession(entry.runId);
  }

  const policy = await loadRunSessionLifecyclePolicy();
  return buildRunSessionSnapshot(merged, policy);
}

/**
 * Active runs for UI reattach and badges.
 *
 * @deprecated Prefer readRunSessionSnapshot — `active` is only truly executing runs under session policy.
 */
export async function readLiveActiveRuns(): Promise<RunsIndex> {
  const snapshot = await readRunSessionSnapshot();

  const updatedAt =
    snapshot.executing.length > 0
      ? snapshot.executing[0]?.startedAt ?? new Date().toISOString()
      : new Date().toISOString();

  return {
    version: 1,
    updatedAt,
    active: snapshot.executing,
  };
}

/** Ensures in-memory runs are marked executing before snapshot partition. */
export function promoteInMemoryRunsToSessionExecuting(): void {
  for (const runId of getActiveRunIds()) {
    if (isRunExecutingInProcessSession(runId)) {
      continue;
    }
    markRunExecutingInProcessSession(runId);
  }
}
