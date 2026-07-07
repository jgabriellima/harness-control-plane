import type { Run } from '@cursor/sdk';

import { hasRuntimeSdkCredentials, localGetRunOptions } from './runtime-sdk-local';
import { canAttemptRuntimeSdkCall } from './runtime-sdk-auth-gate';

export type RunLiveness = 'alive' | 'not_found' | 'terminal' | 'unavailable';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'aborted', 'error']);

function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not found/i.test(message);
}

function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status.toLowerCase());
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
    const run = await Agent.getRun(runId, localGetRunOptions(workspaceRoot));
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
