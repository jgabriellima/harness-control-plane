import { formatUserMessageForDisplay } from './user-message-display';

export const PLACEHOLDER_SESSION_TITLES = new Set(['New chat', 'New session']);

export function isPlaceholderSessionTitle(title: string): boolean {
  return PLACEHOLDER_SESSION_TITLES.has(title.trim());
}

/**
 * Derives a sidebar title from the first user message (slash command token stripped when followed by body).
 */
export function deriveSessionTitleFromMessage(message: string, maxLength = 72): string {
  const trimmed = formatUserMessageForDisplay(message).body.trim();
  if (trimmed.length === 0) {
    return 'New session';
  }

  const normalized = trimmed.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}
