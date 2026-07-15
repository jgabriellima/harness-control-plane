const TAG_BODY_PATTERN = /<([a-z][a-z0-9-]*)([^>]*)>([\s\S]*?)<\/\1>/gi;
const DISPATCH_INJECT_IDS = [
  "rich_ui",
  "computer_use",
  "deep_research",
  "schedule_interview",
  "integrations",
  "attachments",
  "skill",
  "slash_command",
  "continue"
];
const KNOWN_TAGS = new Set(DISPATCH_INJECT_IDS.map((id) => injectTag(id)));
function injectTag(id) {
  return id.replace(/_/g, "-");
}
function parseAttrString(raw) {
  const attrs = {};
  const attrPattern = /([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  for (const match of raw.matchAll(attrPattern)) {
    const key = match[1];
    const value = match[2];
    if (key) {
      attrs[key] = value ?? "";
    }
  }
  return attrs;
}
function wrapPromptInject(id, content, attrs) {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return "";
  }
  const tag = injectTag(id);
  const attrString = attrs && Object.keys(attrs).length > 0 ? ` ${Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(" ")}` : "";
  return `<${tag}${attrString}>
${trimmed}
</${tag}>`;
}
function collectPromptInjectTags(raw) {
  const tags = [];
  for (const match of raw.matchAll(TAG_BODY_PATTERN)) {
    const tag = match[1];
    const attrRaw = match[2] ?? "";
    const content = match[3] ?? "";
    const start = match.index ?? 0;
    if (!tag || !KNOWN_TAGS.has(tag)) {
      continue;
    }
    tags.push({
      tag,
      attrs: parseAttrString(attrRaw),
      content: content.trim(),
      start,
      end: start + match[0].length
    });
  }
  return tags;
}
function stripPromptInjectTags(raw) {
  const tags = collectPromptInjectTags(raw);
  if (tags.length === 0) {
    return { text: raw, tags: [] };
  }
  let text = raw;
  for (const tag of [...tags].sort((left, right) => right.start - left.start)) {
    text = `${text.slice(0, tag.start)}${text.slice(tag.end)}`;
  }
  return {
    text: text.replace(/\n{3,}/g, "\n\n").trim(),
    tags
  };
}
function buildKnownTagStripPattern() {
  const tags = [...KNOWN_TAGS].map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`<(?:${tags.join("|")})[^>]*>[\\s\\S]*?<\\/(?:${tags.join("|")})>`, "gi");
}
function richUiBadgeLabel(attrs, content) {
  const mode = attrs.mode?.trim().toLowerCase();
  if (mode === "adaptive") {
    return "Adaptive Rich UI";
  }
  if (mode === "always" || mode === "on") {
    return "Rich UI";
  }
  if (mode === "off" || mode === "text") {
    return "Plain text";
  }
  if (/\[presentation:\s*adaptive\]/i.test(content) || /Default to plain markdown prose/i.test(content)) {
    return "Adaptive Rich UI";
  }
  return "Rich UI";
}
function sessionContinueBadgeLabel() {
  return "Continue";
}
const DEFAULT_SESSION_CONTINUE_INSTRUCTION = "Continue from where you left off. Resume the interrupted task.";
function buildSessionContinueWirePrompt(instruction = DEFAULT_SESSION_CONTINUE_INSTRUCTION) {
  return wrapPromptInject("continue", instruction);
}

export { DEFAULT_SESSION_CONTINUE_INSTRUCTION as D, buildKnownTagStripPattern as a, buildSessionContinueWirePrompt as b, sessionContinueBadgeLabel as c, richUiBadgeLabel as r, stripPromptInjectTags as s, wrapPromptInject as w };
