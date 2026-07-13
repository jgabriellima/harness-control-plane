/** True when fenced content is a full HTML document suitable for inline preview. */
export function looksLikeHtmlDocument(source: string): boolean {
  const trimmed = source.trim();
  if (trimmed.length < 40) {
    return false;
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('<!doctype html')) {
    return true;
  }

  if (/^<html[\s>]/i.test(trimmed)) {
    return true;
  }

  return /<html[\s>]/i.test(trimmed) && /<\/html>/i.test(trimmed);
}
