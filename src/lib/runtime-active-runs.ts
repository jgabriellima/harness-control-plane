import {
  readAggregatedActiveRuns,
  type ActiveRunEntry,
  type RunsIndex,
} from './runtime-run-registry';
import { getActiveRunIds, getRuntimeRunEntry } from './runtime-sessions';

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
 * Active runs for UI reattach and badges.
 *
 * In-memory SDK registrations win over the materialized runs-index.json, which is
 * append-only audit state that may lag or fail without invalidating a live run.
 */
export async function readLiveActiveRuns(): Promise<RunsIndex> {
  const disk = await readAggregatedActiveRuns();
  const memory = listInMemoryActiveRunEntries();
  const active = mergeActiveRunEntries(disk.active, memory);

  const updatedAt =
    active.length > 0
      ? active[0]?.startedAt ?? disk.updatedAt
      : disk.updatedAt;

  return {
    version: 1,
    updatedAt,
    active,
  };
}
