import type { ConversationRuntimeState } from './runtime-hub-types';

export interface ActiveRunRegistryEntry {
  runId: string;
  conversationId: string;
  agentId: string;
  startedAt?: string;
}

export interface ActiveRunsIndexPayload {
  active?: ActiveRunRegistryEntry[];
}

export interface TurnTrackingIds {
  assistantMessageId: string;
  thinkingMessageId: string;
}

export async function fetchActiveRunsIndex(): Promise<ActiveRunRegistryEntry[]> {
  const response = await fetch('/api/runtime/active-runs');
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as ActiveRunsIndexPayload;
  return payload.active ?? [];
}

export async function attachActiveRunStream(runId: string): Promise<'attached' | 'stale' | 'failed'> {
  const response = await fetch(`/api/runtime/runs/${encodeURIComponent(runId)}/attach`, {
    method: 'POST',
  }).catch(() => null);

  if (!response) {
    return 'failed';
  }

  if (response.status === 410) {
    return 'stale';
  }

  return response.ok ? 'attached' : 'failed';
}

export async function purgeStaleActiveRun(runId: string): Promise<boolean> {
  const response = await fetch(`/api/runtime/runs/${encodeURIComponent(runId)}/reconcile`, {
    method: 'POST',
  }).catch(() => null);

  return response?.ok ?? false;
}

export function applyInterruptedConversationState(
  state: ConversationRuntimeState,
  message?: string,
): ConversationRuntimeState {
  const runId = state.activeRunId ?? 'unknown';
  const tracking = resolveTurnTrackingForActiveRun(state, runId);

  const finalized = {
    ...state,
    messages: state.messages.map((entry) =>
      entry.id === tracking.assistantMessageId || entry.id === tracking.thinkingMessageId
        ? { ...entry, streaming: false }
        : entry,
    ),
    toolActivity: [],
    runActivity: 'idle' as const,
    activeRunId: null,
    runPhase: 'interrupted' as const,
    error: message ?? state.error,
  };

  return finalized;
}

export function resolveTurnTrackingForActiveRun(
  state: ConversationRuntimeState,
  runId: string,
): TurnTrackingIds {
  const streamingAssistant = [...state.messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.streaming);

  if (streamingAssistant) {
    const streamingThinking = [...state.messages]
      .reverse()
      .find((message) => message.role === 'thinking' && message.streaming);
    return {
      assistantMessageId: streamingAssistant.id,
      thinkingMessageId: streamingThinking?.id ?? `thinking-recovered-${runId}`,
    };
  }

  const lastAssistant = [...state.messages].reverse().find((message) => message.role === 'assistant');
  const assistantMessageId = lastAssistant?.id ?? `assistant-recovered-${runId}`;

  return {
    assistantMessageId,
    thinkingMessageId: `thinking-recovered-${runId}`,
  };
}

export function applyActiveRunToConversationState(
  state: ConversationRuntimeState,
  entry: ActiveRunRegistryEntry,
): ConversationRuntimeState {
  const tracking = resolveTurnTrackingForActiveRun(state, entry.runId);
  const hasStreamingAssistant = state.messages.some(
    (message) => message.id === tracking.assistantMessageId && message.streaming,
  );

  let messages = state.messages;

  if (!hasStreamingAssistant) {
    const lastMessage = state.messages[state.messages.length - 1];
    const lastIsUser = lastMessage?.role === 'user';

    if (lastIsUser || state.messages.every((message) => message.role !== 'assistant')) {
      messages = [
        ...state.messages,
        {
          id: tracking.assistantMessageId,
          role: 'assistant' as const,
          content: lastAssistantContent(state, tracking.assistantMessageId),
          streaming: true,
          recordedAt: new Date().toISOString(),
        },
      ];
    } else {
      messages = state.messages.map((message) =>
        message.id === tracking.assistantMessageId
          ? { ...message, streaming: true }
          : message,
      );
    }
  }

  return {
    ...state,
    agentId: entry.agentId,
    activeRunId: entry.runId,
    runPhase: 'streaming',
    runActivity: state.runActivity === 'idle' ? 'dispatching' : state.runActivity,
    error: null,
    messages,
  };
}

function lastAssistantContent(state: ConversationRuntimeState, assistantMessageId: string): string {
  const existing = state.messages.find((message) => message.id === assistantMessageId);
  return existing?.content ?? '';
}

export function findActiveRunForConversation(
  activeRuns: ActiveRunRegistryEntry[],
  conversationId: string,
): ActiveRunRegistryEntry | undefined {
  return activeRuns.find((entry) => entry.conversationId === conversationId);
}
