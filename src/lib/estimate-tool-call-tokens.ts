function estimateTokensFromText(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

function stringifyPayload(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function estimateToolCallInputTokens(args?: unknown): number {
  return estimateTokensFromText(stringifyPayload(args));
}

export function estimateToolCallOutputTokens(result?: unknown): number {
  return estimateTokensFromText(stringifyPayload(result));
}

export function estimateToolCallTokens(args?: unknown, result?: unknown): number {
  return estimateToolCallInputTokens(args) + estimateToolCallOutputTokens(result);
}
