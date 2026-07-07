/**
 * Join assistant text blocks from SDK / transcript payloads.
 * Blocks are separated by newlines so GFM structure (tables, headings, hr) parses correctly.
 * Do not trim blocks — trailing spaces are meaningful at token/block boundaries.
 */
export function joinAssistantTextBlocks(blocks: readonly string[]): string {
  return blocks.filter((block) => block.length > 0).join('\n');
}

/**
 * Merge streaming assistant/thinking chunks from hub SSE events.
 * Handles cumulative snapshots, overlapping token boundaries, and bare deltas.
 *
 * Cursor SDK token deltas are sub-word fragments; word boundaries arrive as explicit
 * whitespace inside the delta. Do not infer spaces between adjacent letter chunks.
 */
export function mergeStreamingAssistantText(existing: string, incoming: string): string {
  if (incoming.length === 0) {
    return existing;
  }
  if (existing.length === 0) {
    return incoming;
  }

  if (incoming.startsWith(existing)) {
    return incoming;
  }

  if (existing.endsWith(incoming)) {
    return existing;
  }

  const maxOverlap = Math.min(existing.length, incoming.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (existing.endsWith(incoming.slice(0, overlap))) {
      const merged = existing + incoming.slice(overlap);
      return merged;
    }
  }

  return existing + incoming;
}
