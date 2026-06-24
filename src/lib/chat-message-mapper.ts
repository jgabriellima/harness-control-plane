import type { StoredChatMessage } from './conversation-store';
import type { ChatMessage } from './runtime-hub-types';
import type { NormalizedMessage } from './runtime-adapters/types';

function serializeToolPayload(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function mapNormalizedMessageToChatMessage(message: NormalizedMessage): ChatMessage {
  if (message.role === 'tool') {
    const name = message.toolName ?? message.content.split(' · ')[0]?.trim() ?? 'tool';
    const status = message.toolStatus ?? message.content.split(' · ')[1]?.trim() ?? 'completed';
    return {
      id: message.id,
      role: 'tool',
      content: `${name} · ${status}`,
      recordedAt: message.recordedAt,
      toolInput: serializeToolPayload(message.toolArgs),
      toolOutput: serializeToolPayload(message.toolResult),
    };
  }

  return {
    id: message.id,
    role: message.role,
    content: message.content,
    recordedAt: message.recordedAt,
    durationMs: message.durationMs,
  };
}

export function mapStoredMessageToChatMessage(message: StoredChatMessage): ChatMessage {
  return mapNormalizedMessageToChatMessage(message);
}

export function mapHydratedMessages(messages: StoredChatMessage[]): ChatMessage[] {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => mapStoredMessageToChatMessage(message));
}
