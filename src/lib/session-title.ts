export const PLACEHOLDER_SESSION_TITLES = new Set(['New chat', 'New session']);

export function isPlaceholderSessionTitle(title: string): boolean {
  return PLACEHOLDER_SESSION_TITLES.has(title.trim());
}

/**
 * Derives a sidebar title from the first user message (slash command token stripped when followed by body).
 */
export function deriveSessionTitleFromMessage(message: string, maxLength = 72): string {
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return 'New session';
  }

  let source = trimmed;
  if (trimmed.startsWith('/')) {
    const spaceIndex = trimmed.indexOf(' ');
    if (spaceIndex > 0) {
      const afterCommand = trimmed.slice(spaceIndex + 1).trim();
      if (afterCommand.length > 0) {
        source = afterCommand;
      }
    }
  }

  const normalized = source.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}
