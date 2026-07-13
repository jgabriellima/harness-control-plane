/**
 * Normalize assistant markdown so remark-gfm can parse tables and block elements
 * that arrive glued to preceding paragraphs during streaming.
 */
export function normalizeMarkdownForGfm(input: string): string {
  let normalized = input;

  // Blank line before GFM table header rows.
  normalized = normalized.replace(/([^\n|])\n(\|[^\n]+\|)/g, '$1\n\n$2');

  // Blank line before ATX headings glued to prior text.
  normalized = normalized.replace(/([^\n#])\n(#{1,6}\s)/g, '$1\n\n$2');

  // Blank line before fenced code blocks glued to prior text.
  normalized = normalized.replace(/([^\n`])\n(```)/g, '$1\n\n$2');

  return normalized.replace(/\n{3,}/g, '\n\n');
}

export function textLooksLikeMarkdown(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }

  return /(^|\n)(#{1,6}\s|[-*+]\s|\d+\.\s|\|.+\||```|>\s|\*\*|__)/m.test(trimmed);
}
