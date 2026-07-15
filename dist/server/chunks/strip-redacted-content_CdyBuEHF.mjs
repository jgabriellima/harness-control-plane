const TIMESTAMP_BLOCK = /<timestamp>[\s\S]*?<\/timestamp>\s*/gi;
const USER_QUERY_BLOCK = /<user_query>\s*([\s\S]*?)\s*<\/user_query>/i;
const OPEN_USER_QUERY = /<user_query>\s*([\s\S]*)$/i;
function stripCursorPromptEnvelope(content) {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  const closedQuery = trimmed.match(USER_QUERY_BLOCK);
  if (closedQuery?.[1] !== void 0) {
    return closedQuery[1].trim();
  }
  const openQuery = trimmed.match(OPEN_USER_QUERY);
  if (openQuery?.[1] !== void 0) {
    return openQuery[1].trim();
  }
  return trimmed.replace(TIMESTAMP_BLOCK, "").trim();
}

const REDACTED_SUFFIX_PATTERN = /\n*\[REDACTED\]\s*$/;
function stripRedactedReasoningContent(content) {
  if (content.trim() === "[REDACTED]") {
    return "";
  }
  return content.replace(REDACTED_SUFFIX_PATTERN, "");
}

export { stripRedactedReasoningContent as a, stripCursorPromptEnvelope as s };
