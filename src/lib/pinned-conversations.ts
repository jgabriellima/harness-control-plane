const PINNED_STORAGE_KEY = 'runtime-hub-pinned-conversations';

export function readPinnedConversationIds(): Set<string> {
  if (typeof window === 'undefined') {
    return new Set();
  }

  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'));
  } catch {
    return new Set();
  }
}

export function persistPinnedConversationIds(ids: Set<string>): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify([...ids]));
}

export function togglePinnedConversation(conversationId: string): boolean {
  const pinned = readPinnedConversationIds();
  const nextPinned = !pinned.has(conversationId);
  if (nextPinned) {
    pinned.add(conversationId);
  } else {
    pinned.delete(conversationId);
  }
  persistPinnedConversationIds(pinned);
  return nextPinned;
}

export function isConversationPinned(conversationId: string): boolean {
  return readPinnedConversationIds().has(conversationId);
}
