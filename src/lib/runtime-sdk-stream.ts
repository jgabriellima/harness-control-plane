import type { Run, SDKMessage } from '@cursor/sdk';

import { isConnectCanceled, isConnectUnauthenticated, attachRecoverableConnectHandler } from './runtime-connect-errors';
import { readLocalRunFailureDetail } from './runtime-local-run-store';
import { classifyRunTerminalOutcome, isFailedRunStatus, mergeRunFailureDetail } from './runtime-run-failure';
import { markRuntimeAuthUnavailable } from './runtime-sdk-auth-gate';

export type RunStreamOutcome = 'completed' | 'cancelled' | 'auth_failed';

export interface RunTerminalStatus extends ReturnType<typeof classifyRunTerminalOutcome> {}

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
      const closePromise = iterator.return();
      attachRecoverableConnectHandler(closePromise);
      await closePromise.catch((error) => {
        if (isConnectCanceled(error)) {
          return undefined;
        }
        throw error;
      });
    }
  }
}

export interface ResolveRunTerminalStatusOptions {
  workspaceCwd?: string;
}

async function resolveLocalRunFailureDetail(
  run: Run,
  workspaceCwd: string | undefined,
  status: string,
  rawResult: string | undefined,
): Promise<string | undefined> {
  if (rawResult?.trim() || !workspaceCwd?.trim() || !isFailedRunStatus(status)) {
    return undefined;
  }

  return readLocalRunFailureDetail(run.agentId, run.id, workspaceCwd);
}

export async function resolveRunTerminalStatus(
  run: Run,
  options?: ResolveRunTerminalStatusOptions,
): Promise<RunTerminalStatus> {
  const workspaceCwd = options?.workspaceCwd?.trim();
  const inlineFailure = run.error?.message?.trim() || run.error?.code?.trim();

  if (!run.supports('wait')) {
    const storeDetail = await resolveLocalRunFailureDetail(
      run,
      workspaceCwd,
      run.status,
      run.result,
    );
    const errorDetail = mergeRunFailureDetail(inlineFailure, storeDetail);
    return classifyRunTerminalOutcome(run.status, run.result, errorDetail);
  }

  try {
    const waitPromise = run.wait();
    attachRecoverableConnectHandler(waitPromise);
    const result = await waitPromise;
    const waitInlineFailure = result.error?.message?.trim() || result.error?.code?.trim();
    const storeDetail = await resolveLocalRunFailureDetail(
      run,
      workspaceCwd,
      result.status,
      result.result,
    );
    const errorDetail = mergeRunFailureDetail(waitInlineFailure, storeDetail);
    return classifyRunTerminalOutcome(result.status, result.result, errorDetail);
  } catch (error) {
    if (isConnectCanceled(error)) {
      return classifyRunTerminalOutcome('cancelled');
    }
    if (isConnectUnauthenticated(error)) {
      markRuntimeAuthUnavailable('wait_unauthenticated');
      return classifyRunTerminalOutcome('failed', '[unauthenticated] Error');
    }
    throw error;
  }
}
