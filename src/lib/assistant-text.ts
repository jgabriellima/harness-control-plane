/**
 * Join assistant text blocks from SDK / transcript payloads.
 * Blocks must be separated by newlines so GFM structure (tables, headings, hr) parses correctly.
 */
export function joinAssistantTextBlocks(blocks: readonly string[]): string {
  return blocks
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .join('\n');
}
