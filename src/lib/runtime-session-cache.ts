export interface CachedConversationSession {
  title: string;
  projectId: string;
  agentId: string | null;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system' | 'thinking' | 'tool';
    content: string;
    toolName?: string;
    toolStatus?: string;
    toolArgs?: unknown;
    toolResult?: unknown;
  }>;
}

const sessionCache = new Map<string, CachedConversationSession>();

export function getCachedConversationSession(
  conversationId: string,
): CachedConversationSession | undefined {
  return sessionCache.get(conversationId);
}

export function setCachedConversationSession(
  conversationId: string,
  session: CachedConversationSession,
): void {
  sessionCache.set(conversationId, session);
}
