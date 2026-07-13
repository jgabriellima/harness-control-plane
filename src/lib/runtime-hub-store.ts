import type {
  ChatMessage,
  ConversationRuntimeState,
  DispatchMessagePayload,
  RunActivityPhase,
  RunPhase,
  RuntimeHubWireEvent,
} from './runtime-hub-types';
import { mergeStreamingAssistantText } from './assistant-text';
import {
  textFromParts,
  upsertParts,
  type AssistantMessagePart,
} from './message-parts';
import { normalizeInspectablePayload } from './format-inspect';
import { stripRedactedReasoningContent } from './strip-redacted-content';
import { DEFAULT_WORKSPACE_ID } from './workspace-constants';
import {
  logInternalRuntimeError,
  runtimeRunIncompleteMessage,
  toUserFacingRuntimeStreamErrorMessage,
} from './user-facing-error';

export function createConversationState(conversationId: string): ConversationRuntimeState {
  return {
    conversationId,
    agentId: null,
    projectId: DEFAULT_WORKSPACE_ID,
    title: null,
    updatedAt: null,
    messages: [],
    activeRunId: null,
    runPhase: 'idle',
    runActivity: 'idle',
    toolActivity: [],
    error: null,
    continuableRun: null,
    lastRequestId: null,
    sdkHealth: 'unknown',
    sdkHealthMessage: null,
    contextUsageRevision: 0,
    hydrated: false,
  };
}

export function resolveRunActivityLabel(
  activity: RunActivityPhase,
  toolActivity: string[],
): string {
  if (activity === 'thinking') {
    return 'Reasoning…';
  }

  if (activity === 'responding') {
    return 'Generating response…';
  }

  if (activity === 'tool' && toolActivity.length > 0) {
    const lastLine = toolActivity[toolActivity.length - 1] ?? '';
    const [toolName = 'tool'] = lastLine.split(' · ');
    const normalized = toolName.trim().toLowerCase();

    if (normalized.includes('read')) {
      return 'Reading file…';
    }
    if (normalized.includes('grep') || normalized.includes('search')) {
      return 'Searching workspace…';
    }
    if (normalized.includes('shell') || normalized.includes('terminal')) {
      return 'Running command…';
    }
    if (normalized.includes('write') || normalized.includes('edit')) {
      return 'Writing file…';
    }

    return `Using ${toolName.trim()}…`;
  }

  if (activity === 'dispatching' || activity === 'tool') {
    return 'Runtime working…';
  }

  return 'Runtime working…';
}

function withActivity(
  state: ConversationRuntimeState,
  activity: RunActivityPhase,
): ConversationRuntimeState {
  if (state.runActivity === activity) {
    return state;
  }
  return { ...state, runActivity: activity };
}

export function applyHubEvent(
  state: ConversationRuntimeState,
  event: RuntimeHubWireEvent,
  assistantMessageId: string,
  thinkingMessageId: string,
): ConversationRuntimeState {
  if (event.type === 'assistant') {
    const text = stripRedactedReasoningContent(
      typeof event.payload.text === 'string' ? event.payload.text : '',
    );
    const payloadParts = Array.isArray(event.payload.parts)
      ? (event.payload.parts as AssistantMessagePart[])
      : undefined;
    const nextActivity: RunActivityPhase =
      text.length > 0 || (payloadParts?.length ?? 0) > 0
        ? 'responding'
        : state.runActivity === 'idle'
          ? 'dispatching'
          : state.runActivity;

    if (text.length === 0 && !payloadParts?.length) {
      return withActivity(state, nextActivity);
    }

    return withActivity(
      {
        ...state,
        messages: state.messages.map((message) =>
          message.id === assistantMessageId
            ? payloadParts
              ? {
                  ...message,
                  content: text.length > 0 ? text : message.content,
                  parts: upsertParts(message.parts, payloadParts),
                }
              : {
                  ...message,
                  content: mergeStreamingAssistantText(message.content, text),
                }
            : message,
        ),
      },
      'responding',
    );
  }

  if (event.type === 'thinking') {
    const text = typeof event.payload.text === 'string' ? event.payload.text : '';
    const durationMs =
      typeof event.payload.duration_ms === 'number' ? event.payload.duration_ms : undefined;

    if (text.length === 0) {
      return withActivity(state, 'thinking');
    }

    const existingThinking = state.messages.find((message) => message.id === thinkingMessageId);
    if (existingThinking) {
      return withActivity(
        {
          ...state,
          messages: state.messages.map((message) =>
            message.id === thinkingMessageId
              ? {
                  ...message,
                  content: mergeStreamingAssistantText(message.content, text),
                  streaming: true,
                  durationMs: durationMs ?? message.durationMs,
                  recordedAt: message.recordedAt ?? event.timestamp,
                }
              : message,
          ),
        },
        'thinking',
      );
    }

    const assistantIndex = state.messages.findIndex((message) => message.id === assistantMessageId);
    const thinkingMessage: ChatMessage = {
      id: thinkingMessageId,
      role: 'thinking',
      content: text,
      streaming: true,
      durationMs,
      recordedAt: event.timestamp,
    };

    const withThinking =
      assistantIndex === -1
        ? { ...state, messages: [...state.messages, thinkingMessage] }
        : {
            ...state,
            messages: [
              ...state.messages.slice(0, assistantIndex),
              thinkingMessage,
              ...state.messages.slice(assistantIndex),
            ],
          };

    return withActivity(withThinking, 'thinking');
  }

  if (event.type === 'tool_call') {
    const tool = typeof event.payload.tool === 'string' ? event.payload.tool : 'tool';
    const status = typeof event.payload.status === 'string' ? event.payload.status : 'running';
    const line = `${tool} · ${status}`;
    const args =
      event.payload.args !== undefined
        ? JSON.stringify(normalizeInspectablePayload(event.payload.args), null, 2)
        : undefined;
    const result =
      event.payload.result !== undefined
        ? JSON.stringify(normalizeInspectablePayload(event.payload.result), null, 2)
        : undefined;

    const callId =
      typeof event.payload.call_id === 'string' && event.payload.call_id.trim().length > 0
        ? event.payload.call_id.trim()
        : `${event.run_id}-${state.messages.filter((message) => message.role === 'tool').length}`;
    const toolMessageId = `tool-${callId}`;
    const existingTool = state.messages.find((message) => message.id === toolMessageId);

    const toolMessages = existingTool
      ? state.messages.map((message) =>
          message.id === existingTool.id
            ? {
                ...message,
                content: line,
                streaming: status === 'running',
                toolInput: args ?? message.toolInput,
                toolOutput: result ?? message.toolOutput,
                recordedAt: message.recordedAt ?? event.timestamp,
              }
            : message,
        )
      : [
          ...state.messages,
          {
            id: toolMessageId,
            role: 'tool' as const,
            content: line,
            streaming: status === 'running',
            recordedAt: event.timestamp,
            toolInput: args,
            toolOutput: result,
          },
        ];

    const toolActivity = existingTool
      ? state.toolActivity.map((entry) => (entry === existingTool.content ? line : entry))
      : [...state.toolActivity, line].slice(-50);

    return withActivity({ ...state, messages: toolMessages, toolActivity }, 'tool');
  }

  if (event.type === 'run.aborted') {
    return {
      ...finalizeTurn(state, assistantMessageId, thinkingMessageId, 'completed'),
      error: null,
    };
  }

  if (event.type === 'run.interrupted') {
    const message =
      typeof event.payload.message === 'string'
        ? event.payload.message
        : 'Run was interrupted before completion';
    return {
      ...finalizeTurn(state, assistantMessageId, thinkingMessageId, 'interrupted'),
      error: message,
    };
  }

  if (event.type === 'run_complete') {
    const status =
      typeof event.payload.status === 'string' ? event.payload.status.trim().toLowerCase() : '';
    if (status === 'error' || status === 'failed' || status === 'expired') {
      const rawMessage =
        typeof event.payload.message === 'string' && event.payload.message.trim().length > 0
          ? event.payload.message
          : runtimeRunIncompleteMessage();
      logInternalRuntimeError('run_complete.failed', rawMessage, {
        run_id: event.run_id,
        status,
      });
      const message = toUserFacingRuntimeStreamErrorMessage(rawMessage);
      return {
        ...finalizeTurn(state, assistantMessageId, thinkingMessageId, 'failed'),
        error: message,
        messages: state.messages.map((entry) =>
          entry.id === assistantMessageId
            ? {
                ...entry,
                content: message,
                streaming: false,
                role: 'system',
              }
            : entry,
        ),
      };
    }

    return finalizeTurn(state, assistantMessageId, thinkingMessageId, 'completed');
  }

  if (event.type === 'error') {
    const rawMessage =
      typeof event.payload.message === 'string' ? event.payload.message : 'Runtime stream failed';
    logInternalRuntimeError('stream.error', rawMessage, { run_id: event.run_id });
    const message = toUserFacingRuntimeStreamErrorMessage(rawMessage);
    return {
      ...finalizeTurn(state, assistantMessageId, thinkingMessageId, 'failed'),
      error: message,
      messages: state.messages.map((entry) =>
        entry.id === assistantMessageId
          ? {
              ...entry,
              content: message,
              streaming: false,
              role: 'system',
            }
          : entry,
      ),
    };
  }

  if (event.type === 'context.usage') {
    return {
      ...state,
      contextUsageRevision: state.contextUsageRevision + 1,
    };
  }

  return state;
}

export function finalizeTurn(
  state: ConversationRuntimeState,
  assistantMessageId: string,
  thinkingMessageId: string,
  phase: RunPhase,
): ConversationRuntimeState {
  const messages = state.messages
    .map((message) => {
      if (message.id === assistantMessageId || message.id === thinkingMessageId) {
        const finalized = { ...message, streaming: false };
        if (message.id === assistantMessageId && message.parts?.length) {
          const text = textFromParts(message.parts);
          return {
            ...finalized,
            content: text.length > 0 ? text : message.content,
            parts: message.parts.map((part) =>
              part.type === 'openui' && part.status === 'streaming'
                ? { ...part, status: 'completed' as const }
                : part,
            ),
          };
        }
        return finalized;
      }
      if (message.role === 'tool' && message.streaming) {
        const [, status = 'completed'] = message.content.split(' · ');
        return {
          ...message,
          streaming: false,
          content: message.content.includes(' · ')
            ? message.content
            : `${message.content} · ${status.trim() || 'completed'}`,
        };
      }
      return message;
    })
    .filter((message) => message.role !== 'thinking' || message.content.trim().length > 0);

  return {
    ...state,
    messages,
    toolActivity: [],
    runActivity: 'idle',
    activeRunId: null,
    runPhase: phase,
    continuableRun: null,
  };
}

export function beginTurn(
  state: ConversationRuntimeState,
  userMessageId: string,
  assistantMessageId: string,
  userContent: string,
  runId: string,
): ConversationRuntimeState {
  return {
    ...state,
    error: null,
    activeRunId: runId,
    runPhase: 'streaming',
    runActivity: 'dispatching',
    toolActivity: [],
    continuableRun: null,
    messages: [
      ...state.messages,
      {
        id: userMessageId,
        role: 'user',
        content: userContent,
        recordedAt: new Date().toISOString(),
      },
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        streaming: true,
        recordedAt: new Date().toISOString(),
      },
    ],
  };
}

export function countStreamingConversations(
  conversations: Map<string, ConversationRuntimeState>,
): number {
  let count = 0;
  for (const state of conversations.values()) {
    if (state.runPhase === 'streaming') {
      count += 1;
    }
  }
  return count;
}
