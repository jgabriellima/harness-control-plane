import type {
  ChatMessage,
  ConversationRuntimeState,
  DispatchMessagePayload,
  RunPhase,
  RuntimeHubWireEvent,
} from './runtime-hub-types';
import { WELCOME_MESSAGE } from './runtime-hub-types';

export function createConversationState(conversationId: string): ConversationRuntimeState {
  return {
    conversationId,
    agentId: null,
    projectId: 'business-workflows',
    title: null,
    messages: [WELCOME_MESSAGE],
    activeRunId: null,
    runPhase: 'idle',
    toolActivity: [],
    error: null,
    hydrated: false,
  };
}

export function applyHubEvent(
  state: ConversationRuntimeState,
  event: RuntimeHubWireEvent,
  assistantMessageId: string,
  thinkingMessageId: string,
): ConversationRuntimeState {
  if (event.type === 'assistant') {
    const text = typeof event.payload.text === 'string' ? event.payload.text : '';
    if (text.length === 0) {
      return state;
    }

    return {
      ...state,
      messages: state.messages.map((message) =>
        message.id === assistantMessageId
          ? { ...message, content: message.content + text }
          : message,
      ),
    };
  }

  if (event.type === 'thinking') {
    const text = typeof event.payload.text === 'string' ? event.payload.text : '';
    if (text.length === 0) {
      return state;
    }

    const existingThinking = state.messages.find((message) => message.id === thinkingMessageId);
    if (existingThinking) {
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === thinkingMessageId
            ? { ...message, content: `${message.content}${text}`, streaming: true }
            : message,
        ),
      };
    }

    const assistantIndex = state.messages.findIndex((message) => message.id === assistantMessageId);
    const thinkingMessage: ChatMessage = {
      id: thinkingMessageId,
      role: 'thinking',
      content: text,
      streaming: true,
    };

    if (assistantIndex === -1) {
      return { ...state, messages: [...state.messages, thinkingMessage] };
    }

    return {
      ...state,
      messages: [
        ...state.messages.slice(0, assistantIndex),
        thinkingMessage,
        ...state.messages.slice(assistantIndex),
      ],
    };
  }

  if (event.type === 'tool_call') {
    const tool = typeof event.payload.tool === 'string' ? event.payload.tool : 'tool';
    const status = typeof event.payload.status === 'string' ? event.payload.status : 'running';
    const line = `${tool} · ${status}`;

    const lastIndex = state.toolActivity.findLastIndex((entry) => entry.startsWith(`${tool} ·`));
    const toolActivity =
      lastIndex >= 0
        ? state.toolActivity.map((entry, index) => (index === lastIndex ? line : entry))
        : [...state.toolActivity, line].slice(-12);

    return { ...state, toolActivity };
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
    toolActivity: [],
    messages: [
      ...state.messages,
      { id: userMessageId, role: 'user', content: userContent },
      { id: assistantMessageId, role: 'assistant', content: '', streaming: true },
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
