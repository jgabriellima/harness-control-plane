import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveHarnessBinding } from './harness-binding';
import {
  ensureWorkspacesReady,
  listWorkspaceProjects,
  resolveProjectWorkspaceRoot,
} from './workspace-manager';

export interface RunRegistryMetadata {
  runId: string;
  conversationId: string;
  agentId: string;
  workspaceRoot: string;
  lastEvent?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readRegistryEventsForRun(
  runId: string,
  workspaceRoot: string,
): Promise<Array<Record<string, unknown>>> {
  try {
    const binding = await resolveHarnessBinding({ workspaceRoot });
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

function metadataFromEvents(
  runId: string,
  workspaceRoot: string,
  events: Array<Record<string, unknown>>,
): RunRegistryMetadata | null {
  if (events.length === 0) {
    return null;
  }

  const started = events.find((event) => event.event === 'run.started');
  const conversationId =
    typeof started?.conversationId === 'string'
      ? started.conversationId
      : typeof events[0]?.conversationId === 'string'
        ? events[0].conversationId
        : '';
  const agentId =
    typeof started?.agentId === 'string'
      ? started.agentId
      : typeof events[0]?.agentId === 'string'
        ? events[0].agentId
        : '';

  if (!conversationId || !agentId) {
    return null;
  }

  const last = events[events.length - 1];
  const lastEvent = typeof last?.event === 'string' ? last.event : undefined;

  return {
    runId,
    conversationId,
    agentId,
    workspaceRoot,
    lastEvent,
  };
}

/**
 * Resolves conversation and agent metadata for a run from the append-only registry log.
 */
export async function findRunRegistryMetadata(
  runId: string,
  preferredWorkspaceRoot?: string,
): Promise<RunRegistryMetadata | null> {
  if (preferredWorkspaceRoot?.trim()) {
    const events = await readRegistryEventsForRun(runId, preferredWorkspaceRoot.trim());
    const metadata = metadataFromEvents(runId, preferredWorkspaceRoot.trim(), events);
    if (metadata) {
      return metadata;
    }
  }

  await ensureWorkspacesReady();
  const projects = await listWorkspaceProjects();

  for (const project of projects) {
    const root = project.path ?? resolveProjectWorkspaceRoot(project.id);
    if (root === preferredWorkspaceRoot?.trim()) {
      continue;
    }
    const events = await readRegistryEventsForRun(runId, root);
    const metadata = metadataFromEvents(runId, root, events);
    if (metadata) {
      return metadata;
    }
  }

  return null;
}

export function registryIndicatesSuccessfulCompletion(lastEvent: string | undefined): boolean {
  return lastEvent === 'run.completed';
}
