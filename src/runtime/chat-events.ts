import type { ChatMessageEvent, RunFailureCategory, RunFailureDetail } from '@/lib/chat-types';
import type { ChatMessage } from '@/lib/runtime-hub-types';

export interface RunFailureClassificationFields {
  failureCategory?: RunFailureCategory | null;
  failureDetail?: RunFailureDetail | null;
}

export function runFailureFieldsFromError(
  err: unknown,
): RunFailureClassificationFields | undefined {
  const e = err as {
    failureCategory?: RunFailureCategory | null;
    failureDetail?: RunFailureDetail | null;
  } | null;
  if (!e || (!e.failureCategory && !e.failureDetail)) {
    return undefined;
  }
  return {
    ...(e.failureCategory ? { failureCategory: e.failureCategory } : {}),
    ...(e.failureDetail ? { failureDetail: e.failureDetail } : {}),
  };
}

export function appendErrorStatusEvent(
  message: ChatMessage,
  detail: string,
  code?: string,
  failure?: RunFailureClassificationFields,
): ChatMessage {
  if (!detail.trim()) {
    return message;
  }
  const events = message.events ?? [];
  const lastIndex = events.length - 1;
  const last = events[lastIndex];
  if (last?.kind === 'status' && last.label === 'error' && last.detail === detail) {
    const merged: ChatStatusEvent = {
      ...last,
      ...(code ? { code } : {}),
      ...(failure?.failureCategory ? { failureCategory: failure.failureCategory } : {}),
      ...(failure?.failureDetail ? { failureDetail: failure.failureDetail } : {}),
    };
    if (JSON.stringify(merged) === JSON.stringify(last)) {
      return message;
    }
    const nextEvents = events.slice();
    nextEvents[lastIndex] = merged;
    return { ...message, events: nextEvents };
  }
  const nextEvent: ChatMessageEvent = {
    kind: 'status',
    label: 'error',
    detail,
    ...(code ? { code } : {}),
    ...(failure?.failureCategory ? { failureCategory: failure.failureCategory } : {}),
    ...(failure?.failureDetail ? { failureDetail: failure.failureDetail } : {}),
  };
  return {
    ...message,
    events: [...events, nextEvent],
  };
}

type ChatStatusEvent = Extract<ChatMessageEvent, { kind: 'status' }>;
