import { isRecoverableRuntimeConnectError } from './runtime-connect-errors';
import { errorFields, runtimeLogger } from './runtime-logger';
import { markRuntimeAuthUnavailable } from './runtime-sdk-auth-gate';

let installed = false;

/**
 * Last-resort guard: Connect RPC auth/cancel rejections must never crash the Astro
 * dev server or SSR process as unhandled rejections.
 */
export function installRuntimeProcessGuard(): void {
  if (installed || typeof process === 'undefined' || typeof process.on !== 'function') {
    return;
  }

  installed = true;

  const recover = (reason: unknown, promise: unknown): void => {
    if (!isRecoverableRuntimeConnectError(reason)) {
      return;
    }

    if (
      promise &&
      typeof promise === 'object' &&
      'catch' in promise &&
      typeof (promise as Promise<unknown>).catch === 'function'
    ) {
      void (promise as Promise<unknown>).catch(() => undefined);
    }

    if (reason instanceof Error && reason.message.toLowerCase().includes('unauthenticated')) {
      markRuntimeAuthUnavailable('unhandled_rejection');
    }

    runtimeLogger.warn('runtime.connect.unhandled_recovered', errorFields(reason));
  };

  // Run before Astro/Vite handlers so late Connect aborts are marked handled.
  process.prependListener('unhandledRejection', recover);
}
