import type { Run, SDKMessage } from '@cursor/sdk';

import { isConnectCanceled } from './runtime-connect-errors';

export type RunStreamOutcome = 'completed' | 'cancelled';

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
    throw error;
  } finally {
    if (typeof iterator.return === 'function') {
      await iterator.return().catch(() => undefined);
    }
  }
}

export async function resolveRunTerminalStatus(
  run: Run,
): Promise<{ status: string; cancelled: boolean }> {
  if (!run.supports('wait')) {
    return { status: run.status, cancelled: false };
  }

  try {
    const result = await run.wait();
    return { status: result.status, cancelled: false };
  } catch (error) {
    if (isConnectCanceled(error)) {
      return { status: 'cancelled', cancelled: true };
    }
    throw error;
  }
}
