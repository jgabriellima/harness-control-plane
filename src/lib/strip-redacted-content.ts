const REDACTED_SUFFIX_PATTERN = /\n*\[REDACTED\]\s*$/;

/**
 * Cursor local transcripts append a literal `[REDACTED]` suffix to assistant text
 * blocks when reasoning was redacted. Strip it so operators see the visible reply.
 */
export function stripRedactedReasoningContent(content: string): string {
  const withoutSuffix = content.replace(REDACTED_SUFFIX_PATTERN, '').trim();
  if (withoutSuffix === '[REDACTED]') {
    return '';
  }
  return withoutSuffix;
}
