import type { Run, SDKMessage } from '@cursor/sdk';

import { isConnectCanceled, isConnectUnauthenticated } from './runtime-connect-errors';
import { markRuntimeAuthUnavailable } from './runtime-sdk-auth-gate';

export type RunStreamOutcome = 'completed' | 'cancelled' | 'auth_failed';

export async function consumeRunStream(
  run: Run,
  onMessage: (message: SDKMessage) => void,
): Promise<RunStreamOutcome> {
  const iterator = run.stream();

  try {
    for await (const message of iterator) {
      onMessage(message);
    }
    return 'completed';
  } catch (error) {
    if (isConnectCanceled(error)) {
      return 'cancelled';
    }
    if (isConnectUnauthenticated(error)) {
      markRuntimeAuthUnavailable('stream_unauthenticated');
      return 'auth_failed';
    }
    throw error;
  } finally {
    if (typeof iterator.return === 'function') {
      await iterator.return().catch(() => undefined);
    }
  }
}

export async function resolveRunTerminalStatus(
  run: Run,
): Promise<{ status: string; cancelled: boolean; authFailed: boolean }> {
  if (!run.supports('wait')) {
    return { status: run.status, cancelled: false, authFailed: false };
  }

  try {
    const result = await run.wait();
    return { status: result.status, cancelled: false, authFailed: false };
  } catch (error) {
    if (isConnectCanceled(error)) {
      return { status: 'cancelled', cancelled: true, authFailed: false };
    }
    if (isConnectUnauthenticated(error)) {
      markRuntimeAuthUnavailable('wait_unauthenticated');
      return { status: 'failed', cancelled: false, authFailed: true };
    }
    throw error;
  }
}
