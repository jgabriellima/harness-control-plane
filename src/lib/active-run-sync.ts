import { seedUserMessageFromTitle } from './conversation-message-seed';
import type { ConversationRuntimeState } from './runtime-hub-types';
import { buildSessionContinueWirePrompt } from './prompt-inject';

export interface ActiveRunRegistryEntry {
  runId: string;
  conversationId: string;
  agentId: string;
  startedAt?: string;
}

export interface ContinuableRunRegistryEntry extends ActiveRunRegistryEntry {
  resumable: boolean;
  message: string;
  resumePrompt: string;
  reason: 'session_boundary';
}

export interface RunSessionSnapshotPayload {
  processSessionId: string;
  policy: {
    indexedAtProcessStart: 'continuable' | 'executing';
    continuable: {
      resumable: boolean;
      message: string;
      resumePrompt: string;
    };
  };
  executing: ActiveRunRegistryEntry[];
  continuable: ContinuableRunRegistryEntry[];
  active?: ActiveRunRegistryEntry[];
}

export interface ActiveRunsIndexPayload {
  active?: ActiveRunRegistryEntry[];
  executing?: ActiveRunRegistryEntry[];
  continuable?: ContinuableRunRegistryEntry[];
  processSessionId?: string;
}

export interface TurnTrackingIds {
  assistantMessageId: string;
  thinkingMessageId: string;
}

export async function fetchRunSessionSnapshot(): Promise<RunSessionSnapshotPayload> {
  const response = await fetch('/api/runtime/active-runs');
  if (!response.ok) {
    return {
      processSessionId: '',
      policy: {
        indexedAtProcessStart: 'continuable',
        continuable: {
          resumable: true,
          message: 'This run was interrupted when the previous session ended.',
          resumePrompt: buildSessionContinueWirePrompt(),
        },
      },
      executing: [],
      continuable: [],
    };
  }

  const payload = (await response.json()) as RunSessionSnapshotPayload;
  return {
    ...payload,
    executing: payload.executing ?? payload.active ?? [],
    continuable: payload.continuable ?? [],
  };
}

/** @deprecated Prefer fetchRunSessionSnapshot */
export async function fetchActiveRunsIndex(): Promise<ActiveRunRegistryEntry[]> {
  const snapshot = await fetchRunSessionSnapshot();
  return snapshot.executing;
}

export interface AttachActiveRunResult {
  outcome: 'attached' | 'completed' | 'stale' | 'failed';
  status?: string;
  message?: string;
}

export interface AttachActiveRunResponse {
  ok?: boolean;
  recovered?: 'completed' | 'failed' | 'stale';
  status?: string;
  message?: string;
}

export async function attachActiveRunStream(runId: string): Promise<AttachActiveRunResult> {
  const response = await fetch(`/api/runtime/runs/${encodeURIComponent(runId)}/attach`, {
    method: 'POST',
  }).catch(() => null);

  if (!response) {
    return { outcome: 'failed' };
  }

  let payload: AttachActiveRunResponse | null = null;
  try {
    payload = (await response.json()) as AttachActiveRunResponse;
  } catch {
    payload = null;
  }

  if (response.ok) {
    if (payload?.recovered === 'completed') {
      return { outcome: 'completed', status: payload.status };
    }
    return { outcome: 'attached' };
  }

  if (response.status === 410) {
    return {
      outcome: 'stale',
      status: payload?.status,
      message: payload?.message,
    };
  }

  if (response.status === 404) {
    return { outcome: 'failed' };
  }

  return { outcome: 'failed', message: payload?.message };
}

export async function purgeStaleActiveRun(runId: string): Promise<boolean> {
  const response = await fetch(`/api/runtime/runs/${encodeURIComponent(runId)}/reconcile`, {
    method: 'POST',
  }).catch(() => null);

  return response?.ok ?? false;
}

export function applyRecoveredCompletedConversationState(
  state: ConversationRuntimeState,
): ConversationRuntimeState {
  const runId = state.activeRunId ?? 'unknown';
  const tracking = resolveTurnTrackingForActiveRun(state, runId);

  return {
    ...state,
    messages: state.messages.map((entry) =>
      entry.id === tracking.assistantMessageId || entry.id === tracking.thinkingMessageId
        ? { ...entry, streaming: false }
        : entry,
    ),
    toolActivity: [],
    runActivity: 'idle',
    activeRunId: null,
    runPhase: 'idle',
    continuableRun: null,
    error: null,
  };
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
    continuableRun: null,
    error: message ?? state.error,
  };

  return finalized;
}

export function applyContinuableRunState(
  state: ConversationRuntimeState,
  entry: ContinuableRunRegistryEntry,
): ConversationRuntimeState {
  const tracking = resolveTurnTrackingForActiveRun(state, entry.runId);
  const messages = state.messages.map((message) =>
    message.id === tracking.assistantMessageId || message.id === tracking.thinkingMessageId
      ? { ...message, streaming: false }
      : message,
  );

  return {
    ...state,
    agentId: entry.agentId,
    activeRunId: entry.runId,
    runPhase: 'continuable',
    runActivity: 'idle',
    toolActivity: [],
    error: null,
    continuableRun: {
      runId: entry.runId,
      agentId: entry.agentId,
      message: entry.message,
      resumePrompt: entry.resumePrompt,
      resumable: entry.resumable,
      reason: entry.reason,
    },
    messages,
  };
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
    continuableRun: null,
    error: null,
    messages: seedUserMessageFromTitle(messages, state.title, state.conversationId),
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

export function findContinuableRunForConversation(
  continuableRuns: ContinuableRunRegistryEntry[],
  conversationId: string,
): ContinuableRunRegistryEntry | undefined {
  return continuableRuns.find((entry) => entry.conversationId === conversationId);
}
