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
