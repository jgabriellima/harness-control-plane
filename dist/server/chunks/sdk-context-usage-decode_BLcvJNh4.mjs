function readVarint(buffer, offset) {
  let value = 0;
  let shift = 0;
  let index = offset;
  while (index < buffer.length) {
    const byte = buffer[index];
    index += 1;
    value |= (byte & 127) << shift;
    if ((byte & 128) === 0) {
      return { value, next: index };
    }
    shift += 7;
  }
  throw new Error("Unexpected end of buffer while reading varint");
}
function readField(buffer, offset) {
  const tagResult = readVarint(buffer, offset);
  const tag = tagResult.value;
  const field = tag >> 3;
  const wire = tag & 7;
  let index = tagResult.next;
  if (wire === 0) {
    const varintResult = readVarint(buffer, index);
    return { field, value: { kind: "varint", value: varintResult.value }, next: varintResult.next };
  }
  if (wire === 2) {
    const lengthResult = readVarint(buffer, index);
    index = lengthResult.next;
    const end = index + lengthResult.value;
    return {
      field,
      value: { kind: "bytes", value: buffer.slice(index, end) },
      next: end
    };
  }
  throw new Error(`Unsupported protobuf wire type ${wire} for field ${field}`);
}
function parseUsageNode(buffer) {
  const node = {};
  let index = 0;
  while (index < buffer.length) {
    let parsed;
    try {
      parsed = readField(buffer, index);
    } catch {
      break;
    }
    index = parsed.next;
    if (parsed.value.kind === "varint" && parsed.field === 6) {
      node.tokens = parsed.value.value;
      continue;
    }
    if (parsed.value.kind !== "bytes" || !parsed.value.value.length) {
      continue;
    }
    const bytes = parsed.value.value;
    const text = new TextDecoder().decode(bytes);
    if (parsed.field === 1) {
      node.tag = text;
    } else if (parsed.field === 4) {
      node.label = text;
    } else if (parsed.field === 5) {
      node.id = text;
    }
  }
  return node;
}
function parseUsageLeafNode(buffer) {
  const node = {};
  let index = 0;
  while (index < buffer.length) {
    let parsed;
    try {
      parsed = readField(buffer, index);
    } catch {
      break;
    }
    index = parsed.next;
    if (parsed.value.kind === "varint" && parsed.field === 6) {
      node.tokens = parsed.value.value;
      continue;
    }
    if (parsed.value.kind !== "bytes" || !parsed.value.value.length) {
      continue;
    }
    const text = new TextDecoder().decode(parsed.value.value);
    if (parsed.field === 1) {
      node.tag = text;
    } else if (parsed.field === 3) {
      node.kind = text;
    } else if (parsed.field === 4) {
      node.label = text;
    } else if (parsed.field === 5) {
      node.id = text;
    } else if (parsed.field === 12) {
      node.contentPreview = normalizeUsageLeafContent(text);
    }
  }
  return node;
}
function normalizeUsageLeafContent(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("- ")) {
    const withoutBullet = trimmed.slice(2).trim();
    const colonIndex = withoutBullet.indexOf(":");
    if (colonIndex > 0) {
      return withoutBullet.slice(colonIndex + 1).trim();
    }
    return withoutBullet;
  }
  return trimmed;
}
function formatSubagentDisplayName(subagentType) {
  const normalized = subagentType.trim();
  if (!normalized) {
    return "Subagent";
  }
  const spaced = normalized.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ");
  return spaced.split(/\s+/).filter((segment) => segment.length > 0).map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1)).join(" ");
}
function containsBytes(haystack, needle) {
  if (needle.length === 0 || haystack.length < needle.length) {
    return false;
  }
  outer: for (let cursor = 0; cursor <= haystack.length - needle.length; cursor += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[cursor + index] !== needle[index]) {
        continue outer;
      }
    }
    return true;
  }
  return false;
}
const USAGE_LEAF_FIELD_LOOKBACK = 256;
function extractUsageLeavesByKind(buffer, kind) {
  const kindBytes = new TextEncoder().encode(kind);
  const collector = [];
  let searchFrom = 0;
  while (searchFrom < buffer.length) {
    const idx = containsBytesAt(buffer, kindBytes, searchFrom);
    if (idx < 0) {
      break;
    }
    searchFrom = idx + 1;
    for (let start = Math.max(0, idx - USAGE_LEAF_FIELD_LOOKBACK); start <= idx; start += 1) {
      let parsed;
      try {
        parsed = readField(buffer, start);
      } catch {
        continue;
      }
      if (parsed.value.kind !== "bytes" || !containsBytes(parsed.value.value, kindBytes)) {
        continue;
      }
      const leaf = parseUsageLeafNode(parsed.value.value);
      if (leaf.kind === kind && leaf.label && leaf.tag) {
        collector.push(leaf);
      }
    }
  }
  return dedupeUsageLeaves(collector);
}
function containsBytesAt(buffer, needle, from) {
  if (needle.length === 0 || buffer.length < needle.length) {
    return -1;
  }
  for (let cursor = from; cursor <= buffer.length - needle.length; cursor += 1) {
    let matches = true;
    for (let index = 0; index < needle.length; index += 1) {
      if (buffer[cursor + index] !== needle[index]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return cursor;
    }
  }
  return -1;
}
function dedupeUsageLeaves(leaves) {
  const byTag = /* @__PURE__ */ new Map();
  for (const leaf of leaves) {
    const tag = leaf.tag?.trim();
    if (!tag) {
      continue;
    }
    const existing = byTag.get(tag);
    if (!existing || (leaf.tokens ?? 0) > (existing.tokens ?? 0)) {
      byTag.set(tag, leaf);
    }
  }
  return [...byTag.values()].sort((left, right) => (right.tokens ?? 0) - (left.tokens ?? 0));
}
function attachCategoryChildren(categories, checkpointBlob) {
  const toolLeaves = extractUsageLeavesByKind(checkpointBlob, "tool_definition");
  const toolsCategory = categories.find((entry) => entry.id === "tools");
  if (toolsCategory && toolLeaves.length > 0) {
    toolsCategory.children = toolLeaves.map((leaf) => ({
      id: leaf.tag,
      label: leaf.label ?? leaf.tag ?? "tool",
      tokens: leaf.tokens ?? 0,
      tag: leaf.tag
    }));
  }
  const ruleLeaves = extractUsageLeavesByKind(checkpointBlob, "rule");
  const rulesCategory = categories.find((entry) => entry.id === "rules");
  if (rulesCategory && ruleLeaves.length > 0) {
    rulesCategory.children = ruleLeaves.map((leaf) => ({
      id: leaf.tag,
      label: leaf.label ?? leaf.tag ?? "rule",
      tokens: leaf.tokens ?? 0,
      tag: leaf.tag
    }));
  }
  const subagentLeaves = extractUsageLeavesByKind(checkpointBlob, "subagent_type");
  const subagentsCategory = categories.find((entry) => entry.id === "subagents");
  if (subagentsCategory && subagentLeaves.length > 0) {
    subagentsCategory.children = subagentLeaves.map((leaf) => ({
      id: leaf.tag,
      label: leaf.label ?? leaf.tag ?? "subagent",
      tokens: leaf.tokens ?? 0,
      tag: leaf.tag,
      contentPreview: leaf.contentPreview
    }));
  }
  attachMcpCategoryChildren(categories, checkpointBlob);
}
const MCP_SERVER_LEAF_KIND = "mcp_meta_tool_server";
function attachMcpCategoryChildren(categories, checkpointBlob) {
  const mcpCategory = categories.find((entry) => entry.id === "mcp");
  if (!mcpCategory) {
    return;
  }
  const serverLeaves = dedupeUsageLeaves(
    extractUsageLeavesByKind(checkpointBlob, MCP_SERVER_LEAF_KIND)
  );
  const blockLeaves = extractUsageLeavesByKind(checkpointBlob, "mcp_block");
  const children = serverLeaves.map((leaf) => ({
    id: leaf.tag,
    label: leaf.label ?? leaf.tag ?? "MCP server",
    tokens: leaf.tokens ?? 0,
    tag: leaf.tag,
    contentPreview: leaf.contentPreview
  }));
  for (const leaf of blockLeaves) {
    children.push({
      id: leaf.tag,
      label: "Dynamic tool schemas",
      tokens: leaf.tokens ?? 0,
      tag: leaf.tag,
      contentPreview: leaf.contentPreview
    });
  }
  if (children.length > 0) {
    mcpCategory.children = children;
  }
}
function looksLikePromptContextUsageTree(buffer) {
  if (buffer.length < 8) {
    return false;
  }
  let index = 0;
  let sawUsedTokens = false;
  let sawMaxTokens = false;
  while (index < buffer.length) {
    let parsed;
    try {
      parsed = readField(buffer, index);
    } catch {
      break;
    }
    index = parsed.next;
    if (parsed.field === 1 && parsed.value.kind === "varint" && parsed.value.value > 0) {
      sawUsedTokens = true;
      continue;
    }
    if (parsed.field === 2 && parsed.value.kind === "varint" && parsed.value.value >= 1e5) {
      sawMaxTokens = true;
      continue;
    }
    if (parsed.field === 4 && parsed.value.kind === "bytes" && parsed.value.value.length > 0) {
      return sawUsedTokens && sawMaxTokens;
    }
  }
  return false;
}
function findPromptContextUsageTreeBuffer(checkpointBlob) {
  let index = 0;
  while (index < checkpointBlob.length) {
    let parsed;
    try {
      parsed = readField(checkpointBlob, index);
    } catch {
      break;
    }
    index = parsed.next;
    if (parsed.field === 5 && parsed.value.kind === "bytes" && looksLikePromptContextUsageTree(parsed.value.value)) {
      return parsed.value.value;
    }
  }
  return null;
}
function parseCategoryNodes(childrenBlob) {
  const categories = [];
  let childIndex = 0;
  while (childIndex < childrenBlob.length) {
    let parsed;
    try {
      parsed = readField(childrenBlob, childIndex);
    } catch {
      break;
    }
    childIndex = parsed.next;
    if (parsed.field === 2 && parsed.value.kind === "bytes") {
      const node = parseUsageNode(parsed.value.value);
      if (node.tag?.startsWith("category:")) {
        categories.push(node);
      }
    }
  }
  return categories;
}
function decodePromptContextUsageSnapshot(checkpointBlob) {
  const treeBuffer = findPromptContextUsageTreeBuffer(checkpointBlob);
  if (!treeBuffer) {
    return null;
  }
  let index = 0;
  let usedTokens = 0;
  let maxTokens = 0;
  let categoriesBlob = null;
  while (index < treeBuffer.length) {
    let parsed;
    try {
      parsed = readField(treeBuffer, index);
    } catch {
      break;
    }
    index = parsed.next;
    if (parsed.field === 1 && parsed.value.kind === "varint") {
      usedTokens = parsed.value.value;
      continue;
    }
    if (parsed.field === 2 && parsed.value.kind === "varint") {
      maxTokens = parsed.value.value;
      continue;
    }
    if (parsed.field === 4 && parsed.value.kind === "bytes") {
      categoriesBlob = parsed.value.value;
      break;
    }
  }
  if (!categoriesBlob) {
    return null;
  }
  const categories = parseCategoryNodes(categoriesBlob);
  attachCategoryChildren(categories, checkpointBlob);
  return {
    usedTokens,
    maxTokens,
    categories
  };
}

export { decodePromptContextUsageSnapshot as d, formatSubagentDisplayName as f };
