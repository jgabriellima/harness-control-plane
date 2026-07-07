const TIMESTAMP_BLOCK = /<timestamp>[\s\S]*?<\/timestamp>\s*/gi;
const USER_QUERY_BLOCK = /<user_query>\s*([\s\S]*?)\s*<\/user_query>/i;
const OPEN_USER_QUERY = /<user_query>\s*([\s\S]*)$/i;

/**
 * Cursor SDK agent transcripts store the operator prompt inside a metadata
 * envelope (`<timestamp>`, `<user_query>`, …). Strip that wrapper so hydrated
 * conversations show the same text the composer displayed at send time.
 */
export function stripCursorPromptEnvelope(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  const closedQuery = trimmed.match(USER_QUERY_BLOCK);
  if (closedQuery?.[1] !== undefined) {
    return closedQuery[1].trim();
  }

  const openQuery = trimmed.match(OPEN_USER_QUERY);
  if (openQuery?.[1] !== undefined) {
    return openQuery[1].trim();
  }

  return trimmed.replace(TIMESTAMP_BLOCK, '').trim();
}
