const CONVERSATION_ID_STAMP = /^conv-(\d{8}T\d{6})-/;

function parseConversationIdTimestamp(conversationId: string): Date | null {
  const match = conversationId.match(CONVERSATION_ID_STAMP);
  if (!match?.[1]) {
    return null;
  }

  const raw = match[1];
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveConversationTimestamp(
  conversationId: string,
  updatedAt: string | null | undefined,
): Date | null {
  if (updatedAt) {
    const fromUpdated = new Date(updatedAt);
    if (!Number.isNaN(fromUpdated.getTime())) {
      return fromUpdated;
    }
  }

  return parseConversationIdTimestamp(conversationId);
}

export function formatSessionTimestamp(
  conversationId: string,
  updatedAt: string | null | undefined,
  locale?: string,
): string | null {
  const date = resolveConversationTimestamp(conversationId, updatedAt);
  if (!date) {
    return null;
  }

  return date.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
