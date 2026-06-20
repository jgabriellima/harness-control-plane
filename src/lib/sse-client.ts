import type { ExecutionEventWire } from './execution-events';
import type { RuntimeHubWireEvent } from './runtime-hub-types';

export interface ExecutionSSEHandlers {
  onEvent: (event: ExecutionEventWire) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

function isExecutionEventWire(value: unknown): value is ExecutionEventWire {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.execution_id === 'string' &&
    typeof record.timestamp === 'string' &&
    typeof record.source === 'string' &&
    typeof record.type === 'string' &&
    typeof record.payload === 'object' &&
    record.payload !== null
  );
}

export function subscribeExecutionEvents(
  executionId: string,
  handlers: ExecutionSSEHandlers,
): () => void {
  const url = `/api/executions/${encodeURIComponent(executionId)}/events`;
  const source = new EventSource(url);
  let closedByClient = false;

  source.onopen = () => {
    handlers.onOpen?.();
  };

  source.onmessage = (message: MessageEvent<string>) => {
    try {
      const parsed: unknown = JSON.parse(message.data);
      if (isExecutionEventWire(parsed)) {
        handlers.onEvent(parsed);
      }
    } catch {
      // Ignore malformed SSE payloads.
    }
  };

  source.onerror = (error: Event) => {
    handlers.onError?.(error);
    if (source.readyState === EventSource.CLOSED && !closedByClient) {
      handlers.onClose?.();
    }
  };

  return () => {
    closedByClient = true;
    source.close();
    handlers.onClose?.();
  };
}

export interface RuntimeHubSSEHandlers {
  onEvent: (event: RuntimeHubWireEvent) => void;
  onError?: (error: Error) => void;
}

function isRuntimeHubWireEvent(value: unknown): value is RuntimeHubWireEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.type === 'string' &&
    typeof record.conversation_id === 'string' &&
    typeof record.payload === 'object' &&
    record.payload !== null
  );
}

export function subscribeRuntimeHubStream(handlers: RuntimeHubSSEHandlers): () => void {
  const source = new EventSource('/api/runtime/hub/events');
  let closedByClient = false;

  source.onmessage = (message: MessageEvent<string>) => {
    try {
      const parsed: unknown = JSON.parse(message.data);
      if (!isRuntimeHubWireEvent(parsed)) {
        return;
      }
      handlers.onEvent(parsed);
    } catch {
      // Ignore malformed SSE payloads.
    }
  };

  source.onerror = () => {
    if (!closedByClient) {
      handlers.onError?.(new Error('Runtime hub stream connection failed'));
      source.close();
    }
  };

  return () => {
    closedByClient = true;
    source.close();
  };
}

export interface RuntimeStreamEvent {
  type: string;
  run_id: string;
  agent_id: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface RuntimeSSEHandlers {
  onEvent: (event: { type: string; payload: Record<string, unknown> }) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

function isRuntimeStreamEvent(value: unknown): value is RuntimeStreamEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.type === 'string' &&
    typeof record.payload === 'object' &&
    record.payload !== null
  );
}

export function subscribeRuntimeStream(streamUrl: string, handlers: RuntimeSSEHandlers): () => void {
  const source = new EventSource(streamUrl);
  let closedByClient = false;

  source.onmessage = (message: MessageEvent<string>) => {
    try {
      const parsed: unknown = JSON.parse(message.data);
      if (!isRuntimeStreamEvent(parsed)) {
        return;
      }

      handlers.onEvent({
        type: parsed.type,
        payload: parsed.payload,
      });

      if (parsed.type === 'run_complete' || parsed.type === 'error') {
        closedByClient = true;
        source.close();
        if (parsed.type === 'error') {
          const errorMessage =
            typeof parsed.payload.message === 'string'
              ? parsed.payload.message
              : 'Runtime stream failed';
          handlers.onError?.(new Error(errorMessage));
        } else {
          handlers.onComplete?.();
        }
      }
    } catch {
      // Ignore malformed SSE payloads.
    }
  };

  source.onerror = () => {
    if (!closedByClient) {
      handlers.onError?.(new Error('Runtime stream connection failed'));
      source.close();
    }
  };

  return () => {
    closedByClient = true;
    source.close();
  };
}
