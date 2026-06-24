import type { APIRoute } from 'astro';

import { jsonError } from '../../../../lib/api-json';
import { getBrowserSession, subscribeBrowserScreencast } from '../../../../lib/runtime-browser-bridge';

function encodeSseFrame(frameBase64: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(`data: ${JSON.stringify({ frame: frameBase64 })}\n\n`);
}

function encodeSseHeartbeat(): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(': heartbeat\n\n');
}

export const GET: APIRoute = async ({ url, request }) => {
  const sessionId = url.searchParams.get('session_id')?.trim();
  if (!sessionId) {
    return jsonError('session_id query parameter is required', 400);
  }

  const session = getBrowserSession(sessionId);
  if (!session) {
    return jsonError('Browser session not found', 404);
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let unsubscribe: (() => void) | null = null;

      function closeStream(): void {
        if (closed) {
          return;
        }
        closed = true;
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = undefined;
        }
        unsubscribe?.();
        unsubscribe = null;
        try {
          controller.close();
        } catch {
          // Stream already closed.
        }
      }

      function safeEnqueue(chunk: Uint8Array): void {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(chunk);
        } catch {
          closeStream();
        }
      }

      heartbeat = setInterval(() => {
        safeEnqueue(encodeSseHeartbeat());
      }, 15_000);

      unsubscribe = subscribeBrowserScreencast(sessionId, (frame) => {
        safeEnqueue(encodeSseFrame(frame));
      });

      if (!unsubscribe) {
        closeStream();
        return;
      }

      request.signal.addEventListener('abort', closeStream, { once: true });
    },
    cancel() {
      // Handled by abort listener.
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
};
