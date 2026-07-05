import { Code, ConnectError } from '@connectrpc/connect';

/**
 * Connect RPC aborts in-flight requests via AbortSignal when a stream is
 * superseded, the client disconnects, or the SDK cancels a run. Those
 * rejections are expected — not operational failures.
 */
export function isConnectCanceled(error: unknown): boolean {
  if (error instanceof ConnectError && error.code === Code.Canceled) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('[canceled]') || message.includes('operation was aborted');
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
