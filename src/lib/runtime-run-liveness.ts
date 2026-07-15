import type { Run } from '@cursor/sdk';

import {
  ensureWorkspacesReady,
  listWorkspaceProjects,
  resolveProjectWorkspaceRoot,
} from './workspace-manager';
import { isFailedRunStatus } from './runtime-run-failure';
import { hasRuntimeSdkCredentials, localGetRunOptions } from './runtime-sdk-local';
import { canAttemptRuntimeSdkCall } from './runtime-sdk-auth-gate';

export type RunLiveness = 'alive' | 'not_found' | 'terminal' | 'unavailable';

const TERMINAL_STATUSES = new Set([
  'completed',
  'finished',
  'failed',
  'cancelled',
  'aborted',
  'error',
  'expired',
]);

const SUCCESS_TERMINAL_STATUSES = new Set(['completed', 'finished', 'succeeded']);

function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not found/i.test(message);
}

function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status.toLowerCase());
}

export function isSuccessfulTerminalStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  if (SUCCESS_TERMINAL_STATUSES.has(normalized)) {
    return true;
  }
  if (!isTerminalStatus(normalized)) {
    return false;
  }
  return !isFailedRunStatus(normalized) && normalized !== 'cancelled' && normalized !== 'aborted';
}

export interface RunLivenessProbe extends Awaited<ReturnType<typeof probeRunLiveness>> {
  workspaceRoot?: string;
}

/**
 * Probes whether a run exists and can be streamed from the local Cursor SDK store.
 */
export async function probeRunLiveness(
  runId: string,
  workspaceRoot: string,
): Promise<{ liveness: RunLiveness; run?: Run }> {
  if (!hasRuntimeSdkCredentials() || !canAttemptRuntimeSdkCall()) {
    return { liveness: 'unavailable' };
  }

  try {
    const { Agent } = await import('@cursor/sdk');
    const run = await Agent.getRun(runId, await localGetRunOptions(workspaceRoot));
    const status = typeof run.status === 'string' ? run.status : '';

    if (isTerminalStatus(status)) {
      return { liveness: 'terminal', run };
    }

    return { liveness: 'alive', run };
  } catch (error) {
    if (isNotFoundError(error)) {
      return { liveness: 'not_found' };
    }
    throw error;
  }
}

/**
 * Probes run liveness across all provisioned workspace roots until a store hit is found.
 */
export async function probeRunLivenessAcrossWorkspaces(runId: string): Promise<RunLivenessProbe> {
  await ensureWorkspacesReady();
  const projects = await listWorkspaceProjects();

  for (const project of projects) {
    const root = project.path ?? resolveProjectWorkspaceRoot(project.id);
    const probe = await probeRunLiveness(runId, root);
    if (probe.liveness !== 'not_found') {
      return { ...probe, workspaceRoot: root };
    }
  }

  return { liveness: 'not_found' };
}
