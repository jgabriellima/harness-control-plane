import type { ChatMessage, ConversationRuntimeState } from './runtime-hub-types';
import type { UserContextBadge } from './user-message-display';
import { formatUserMessageForDisplay } from './user-message-display';

const PLACEHOLDER_TITLES = new Set(['New chat', 'Schedule setup', 'Loading session…']);
const PENDING_USER_MESSAGE_PREFIX = 'hcp-pending-user:';

export function isLiveConversationState(state: ConversationRuntimeState): boolean {
  return (
    state.runPhase === 'streaming' ||
    state.activeRunId !== null ||
    state.messages.some((message) => message.streaming)
  );
}

export function resolveHydratedMessages(
  existing: ConversationRuntimeState,
  restored: ChatMessage[],
  title: string | null | undefined,
  conversationId: string,
): ChatMessage[] {
  if (isLiveConversationState(existing) && existing.messages.length > 0) {
    return existing.messages;
  }

  return seedUserMessageFromTitle(restored, title, conversationId);
}

export function isSeedableConversationTitle(title: string | null | undefined): title is string {
  const trimmed = title?.trim();
  return Boolean(trimmed && !PLACEHOLDER_TITLES.has(trimmed));
}

export function cachePendingUserMessage(
  conversationId: string,
  content: string,
  badges?: UserContextBadge[],
): void {
  if (typeof window === 'undefined' || content.trim().length === 0) {
    return;
  }

  try {
    sessionStorage.setItem(
      `${PENDING_USER_MESSAGE_PREFIX}${conversationId}`,
      JSON.stringify({
        content,
        badges: badges ?? [],
        cachedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Ignore quota / privacy mode failures.
  }
}

export function clearPendingUserMessage(conversationId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    sessionStorage.removeItem(`${PENDING_USER_MESSAGE_PREFIX}${conversationId}`);
  } catch {
    // Ignore storage failures.
  }
}

function readPendingUserMessage(conversationId: string): {
  content: string;
  badges: UserContextBadge[];
} | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(`${PENDING_USER_MESSAGE_PREFIX}${conversationId}`);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      content?: string;
      badges?: UserContextBadge[];
    };

    const content = parsed.content?.trim() ?? '';
    if (content.length === 0) {
      return null;
    }

    return {
      content,
      badges: parsed.badges ?? [],
    };
  } catch {
    return null;
  }
}

function buildRecoveredUserMessage(
  conversationId: string,
  content: string,
  badges: UserContextBadge[] = [],
): ChatMessage {
  return {
    id: `user-recovered-${conversationId}`,
    role: 'user',
    content,
    contextBadges: badges.length > 0 ? badges : undefined,
    recordedAt: new Date().toISOString(),
  };
}

/**
 * When hydrate runs before the vendor transcript flushes, the API can return an
 * empty or thinking-only slice. Seed the operator turn from the session title
 * so user bubbles survive refresh during active runs.
 */
export function seedUserMessageFromTitle(
  messages: ChatMessage[],
  title: string | null | undefined,
  conversationId: string,
): ChatMessage[] {
  if (messages.some((message) => message.role === 'user')) {
    clearPendingUserMessage(conversationId);
    return messages;
  }

  if (isSeedableConversationTitle(title)) {
    const display = formatUserMessageForDisplay(title);
    return [
      buildRecoveredUserMessage(
        conversationId,
        display.body.length > 0 ? display.body : title,
        display.badges,
      ),
      ...messages,
    ];
  }

  const pending = readPendingUserMessage(conversationId);
  if (!pending) {
    return messages;
  }

  return [buildRecoveredUserMessage(conversationId, pending.content, pending.badges), ...messages];
}
