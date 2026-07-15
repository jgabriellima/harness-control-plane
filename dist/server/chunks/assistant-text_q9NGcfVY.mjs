function joinAssistantTextBlocks(blocks) {
  return blocks.filter((block) => block.length > 0).join("\n");
}
function mergeStreamingAssistantText(existing, incoming) {
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

export { joinAssistantTextBlocks as j, mergeStreamingAssistantText as m };
