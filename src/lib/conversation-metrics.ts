import type { ChatMessage, ChatMessageRole } from './runtime-hub-types';

export interface ConversationEventSlice {
  role: ChatMessageRole;
  count: number;
  color: string;
}

export interface ConversationMetrics {
  executionTimeMs: number;
  tokenEstimate: number;
  eventSlices: ConversationEventSlice[];
  totalEvents: number;
}

const ROLE_COLORS: Record<ChatMessageRole, string> = {
  user: '#7c3aed',
  assistant: '#6366f1',
  thinking: '#a78bfa',
  tool: '#94a3b8',
  system: '#cbd5e1',
};

const COUNTED_ROLES: ChatMessageRole[] = ['user', 'assistant', 'thinking', 'tool', 'system'];

function estimateTokensFromText(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function computeConversationMetrics(messages: ChatMessage[]): ConversationMetrics {
  const roleCounts = new Map<ChatMessageRole, number>();
  let executionTimeMs = 0;
  let tokenEstimate = 0;

  for (const message of messages) {
    if (message.id === 'welcome') {
      continue;
    }

    roleCounts.set(message.role, (roleCounts.get(message.role) ?? 0) + 1);
    tokenEstimate += estimateTokensFromText(message.content);

    if (message.durationMs !== undefined && message.durationMs > 0) {
      executionTimeMs += message.durationMs;
    }
  }

  const eventSlices: ConversationEventSlice[] = COUNTED_ROLES.flatMap((role) => {
    const count = roleCounts.get(role) ?? 0;
    if (count === 0) {
      return [];
    }
    return [{ role, count, color: ROLE_COLORS[role] }];
  });

  const totalEvents = eventSlices.reduce((sum, slice) => sum + slice.count, 0);

  return {
    executionTimeMs,
    tokenEstimate,
    eventSlices,
    totalEvents,
  };
}

export function formatExecutionTime(ms: number): string {
  if (ms <= 0) {
    return '—';
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatTokenEstimate(tokens: number): string {
  if (tokens <= 0) {
    return '—';
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return String(tokens);
}
