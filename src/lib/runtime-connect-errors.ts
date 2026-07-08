import { Code, ConnectError } from '@connectrpc/connect';

/**
 * Connect RPC aborts in-flight requests via AbortSignal when a stream is
 * superseded, the client disconnects, or the SDK cancels a run. Those
 * rejections are expected — not operational failures.
 */
export function isConnectCanceled(error: unknown): boolean {
  if (
    error instanceof ConnectError &&
    (error.code === Code.Canceled || error.code === Code.Aborted)
  ) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('[canceled]') ||
      message.includes('[aborted]') ||
      message.includes('operation was aborted') ||
      message.includes('econnreset')
    );
  }

  return false;
}

export function isConnectUnauthenticated(error: unknown): boolean {
  if (error instanceof ConnectError && error.code === Code.Unauthenticated) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('[unauthenticated]') || message.includes('invalid api key');
  }

  return false;
}

export function formatRuntimeConnectError(error: unknown): string {
  if (isConnectUnauthenticated(error)) {
    return 'CURSOR_API_KEY inválida ou rejeitada — verifique harness-control-plane/.env e reinicie o dev server';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Runtime stream failed';
}

/** Errors that must degrade gracefully — never take down the control plane process. */
export function isRecoverableRuntimeConnectError(error: unknown): boolean {
  return isConnectCanceled(error) || isConnectUnauthenticated(error);
}

/**
 * Connect RPC may reject on internal HTTP/2 cleanup promises that outlive the
 * caller's await chain (e.g. superseded streams after run.cancel or run.stream).
 * Attach a catch so those aborts never surface as process-level unhandled rejections.
 */
export function attachRecoverableConnectHandler(promise: Promise<unknown>): void {
  void promise.catch((error) => {
    if (isRecoverableRuntimeConnectError(error)) {
      return;
    }
    // Non-recoverable errors must be surfaced by the primary await path.
  });
}

/** await run.cancel() while swallowing expected Connect abort side effects. */
export async function cancelRunIgnoringConnectAbort(run: { cancel: () => Promise<void> }): Promise<void> {
  const promise = run.cancel();
  attachRecoverableConnectHandler(promise);
  try {
    await promise;
  } catch (error) {
    if (isConnectCanceled(error)) {
      return;
    }
    throw error;
  }
}
