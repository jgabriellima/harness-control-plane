import type {
  ChatMessage,
  ConversationRuntimeState,
  DispatchMessagePayload,
  RunActivityPhase,
  RunPhase,
  RuntimeHubWireEvent,
} from './runtime-hub-types';
import { WELCOME_MESSAGE } from './runtime-hub-types';
import { DEFAULT_WORKSPACE_ID } from './workspace-constants';

export function createConversationState(conversationId: string): ConversationRuntimeState {
  return {
    conversationId,
    agentId: null,
    projectId: DEFAULT_WORKSPACE_ID,
    title: null,
    updatedAt: null,
    messages: [WELCOME_MESSAGE],
    activeRunId: null,
    runPhase: 'idle',
    runActivity: 'idle',
    toolActivity: [],
    error: null,
    lastRequestId: null,
    sdkHealth: 'unknown',
    sdkHealthMessage: null,
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
    const text = typeof event.payload.text === 'string' ? event.payload.text : '';
    const nextActivity: RunActivityPhase =
      text.length > 0 ? 'responding' : state.runActivity === 'idle' ? 'dispatching' : state.runActivity;

    if (text.length === 0) {
      return withActivity(state, nextActivity);
    }

    return withActivity(
      {
        ...state,
        messages: state.messages.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content: message.content + text }
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
                  content: `${message.content}${text}`,
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
      event.payload.args !== undefined ? JSON.stringify(event.payload.args, null, 2) : undefined;
    const result =
      event.payload.result !== undefined ? JSON.stringify(event.payload.result, null, 2) : undefined;

    const toolMessageId = `tool-${event.run_id}-${tool}-${state.messages.length}`;
    const existingTool = state.messages.find(
      (message) => message.role === 'tool' && message.id.startsWith(`tool-${event.run_id}-${tool}`),
    );

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

    const lastIndex = state.toolActivity.findLastIndex((entry) => entry.startsWith(`${tool} ·`));
    const toolActivity =
      lastIndex >= 0
        ? state.toolActivity.map((entry, index) => (index === lastIndex ? line : entry))
        : [...state.toolActivity, line].slice(-12);

    return withActivity({ ...state, messages: toolMessages, toolActivity }, 'tool');
  }

  if (event.type === 'run.aborted') {
    return {
      ...finalizeTurn(state, assistantMessageId, thinkingMessageId, 'completed'),
      error: null,
    };
  }

  if (event.type === 'run_complete') {
    return finalizeTurn(state, assistantMessageId, thinkingMessageId, 'completed');
  }

  if (event.type === 'error') {
    const message =
      typeof event.payload.message === 'string' ? event.payload.message : 'Runtime stream failed';
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
        return { ...message, streaming: false };
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
    runPhase: phase === 'completed' ? 'completed' : phase,
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
