import type { StoredChatMessage } from './conversation-store';
import type { ChatMessage } from './runtime-hub-types';
import type { NormalizedMessage } from './runtime-adapters/types';
import { normalizeInspectablePayload } from './format-inspect';
import { stripRedactedReasoningContent } from './strip-redacted-content';
import { formatUserMessageForDisplay } from './user-message-display';

function serializeToolPayload(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = normalizeInspectablePayload(value);

  if (typeof normalized === 'string') {
    return normalized;
  }

  try {
    return JSON.stringify(normalized, null, 2);
  } catch {
    return String(normalized);
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

  const content =
    message.role === 'assistant' || message.role === 'thinking'
      ? stripRedactedReasoningContent(message.content)
      : message.content;

  if (message.role === 'user') {
    const display = formatUserMessageForDisplay(content);
    return {
      id: message.id,
      role: message.role,
      content: display.body,
      contextBadges: display.badges.length > 0 ? display.badges : undefined,
      recordedAt: message.recordedAt,
      durationMs: message.durationMs,
    };
  }

  return {
    id: message.id,
    role: message.role,
    content,
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
