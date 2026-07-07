/**
 * Join assistant text blocks from SDK / transcript payloads.
 * Blocks are separated by newlines so GFM structure (tables, headings, hr) parses correctly.
 * Do not trim blocks — trailing spaces are meaningful at token/block boundaries.
 */
export function joinAssistantTextBlocks(blocks: readonly string[]): string {
  return blocks.filter((block) => block.length > 0).join('\n');
}

function needsSpaceBetween(existing: string, incoming: string): boolean {
  const last = existing.at(-1);
  const first = incoming[0];
  if (!last || !first) {
    return false;
  }
  if (/\s/u.test(last) || /\s/u.test(first)) {
    return false;
  }
  if (/[.,;:!?)\]}»"']/u.test(last)) {
    return false;
  }
  if (/[([{«"']/u.test(first)) {
    return false;
  }
  return /[\p{L}\p{N}]/u.test(last) && /[\p{L}\p{N}]/u.test(first);
}

/**
 * Merge streaming assistant/thinking chunks from hub SSE events.
 * Handles cumulative snapshots, overlapping token boundaries, and bare deltas.
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

  if (needsSpaceBetween(existing, incoming)) {
    return `${existing} ${incoming}`;
  }

  return existing + incoming;
}
