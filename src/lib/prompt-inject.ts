/**
 * Dispatch prompt inject wire protocol.
 *
 * Tags are mandatory open/close wrappers so hydrated transcripts strip reliably
 * and the UI renders chips instead of raw prompt prose.
 *
 * Convention: entry id uses snake_case (`rich_ui`), wire tag uses kebab-case (`rich-ui`).
 * This is stable harness protocol — not a per-workspace config surface.
 */

export interface ParsedPromptInject {
  tag: string;
  attrs: Record<string, string>;
  content: string;
  start: number;
  end: number;
}

const TAG_BODY_PATTERN =
  /<([a-z][a-z0-9-]*)([^>]*)>([\s\S]*?)<\/\1>/gi;

/** Entry ids used by dispatch/composer when wrapping injections. */
export const DISPATCH_INJECT_IDS = [
  'rich_ui',
  'computer_use',
  'deep_research',
  'schedule_interview',
  'integrations',
  'attachments',
  'skill',
  'slash_command',
  'continue',
] as const;

export type DispatchInjectId = (typeof DISPATCH_INJECT_IDS)[number];

const KNOWN_TAGS = new Set(DISPATCH_INJECT_IDS.map((id) => injectTag(id)));

export function injectTag(id: DispatchInjectId | string): string {
  return id.replace(/_/g, '-');
}

function parseAttrString(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrPattern = /([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  for (const match of raw.matchAll(attrPattern)) {
    const key = match[1];
    const value = match[2];
    if (key) {
      attrs[key] = value ?? '';
    }
  }
  return attrs;
}

export function wrapPromptInject(
  id: DispatchInjectId | string,
  content: string,
  attrs?: Record<string, string>,
): string {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return '';
  }

  const tag = injectTag(id);
  const attrString =
    attrs && Object.keys(attrs).length > 0
      ? ` ${Object.entries(attrs)
          .map(([key, value]) => `${key}="${value}"`)
          .join(' ')}`
      : '';

  return `<${tag}${attrString}>\n${trimmed}\n</${tag}>`;
}

export function collectPromptInjectTags(raw: string): ParsedPromptInject[] {
  const tags: ParsedPromptInject[] = [];
  for (const match of raw.matchAll(TAG_BODY_PATTERN)) {
    const tag = match[1];
    const attrRaw = match[2] ?? '';
    const content = match[3] ?? '';
    const start = match.index ?? 0;
    if (!tag || !KNOWN_TAGS.has(tag)) {
      continue;
    }
    tags.push({
      tag,
      attrs: parseAttrString(attrRaw),
      content: content.trim(),
      start,
      end: start + match[0].length,
    });
  }
  return tags;
}

export function stripPromptInjectTags(raw: string): { text: string; tags: ParsedPromptInject[] } {
  const tags = collectPromptInjectTags(raw);
  if (tags.length === 0) {
    return { text: raw, tags: [] };
  }

  let text = raw;
  for (const tag of [...tags].sort((left, right) => right.start - left.start)) {
    text = `${text.slice(0, tag.start)}${text.slice(tag.end)}`;
  }

  return {
    text: text.replace(/\n{3,}/g, '\n\n').trim(),
    tags,
  };
}

export function buildKnownTagStripPattern(): RegExp {
  const tags = [...KNOWN_TAGS].map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`<(?:${tags.join('|')})[^>]*>[\\s\\S]*?<\\/(?:${tags.join('|')})>`, 'gi');
}

export function richUiBadgeLabel(attrs: Record<string, string>, content: string): string {
  const mode = attrs.mode?.trim().toLowerCase();
  if (mode === 'adaptive') {
    return 'Adaptive Rich UI';
  }
  if (mode === 'always' || mode === 'on') {
    return 'Rich UI';
  }
  if (mode === 'off' || mode === 'text') {
    return 'Plain text';
  }
  if (/\[presentation:\s*adaptive\]/i.test(content) || /Default to plain markdown prose/i.test(content)) {
    return 'Adaptive Rich UI';
  }
  return 'Rich UI';
}

/** UI chip label for session-continue resume dispatches (i18n surface — keep neutral). */
export function sessionContinueBadgeLabel(): string {
  return 'Continue';
}

export const DEFAULT_SESSION_CONTINUE_INSTRUCTION =
  'Continue from where you left off. Resume the interrupted task.';

export function buildSessionContinueWirePrompt(
  instruction: string = DEFAULT_SESSION_CONTINUE_INSTRUCTION,
): string {
  return wrapPromptInject('continue', instruction);
}
