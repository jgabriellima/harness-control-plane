import { stripCursorPromptEnvelope } from './strip-cursor-prompt-envelope';
import { stripPresentationArtifacts } from './openui-envelope';
import {
  richUiBadgeLabel,
  sessionContinueBadgeLabel,
  stripPromptInjectTags,
  type ParsedPromptInject,
} from './prompt-inject';

export type UserContextBadgeKind =
  | 'slash_command'
  | 'presentation'
  | 'computer_use'
  | 'mode'
  | 'integration'
  | 'attachment'
  | 'schedule'
  | 'skill'
  | 'continue'
  | 'internal';

export interface UserContextBadge {
  id: string;
  kind: UserContextBadgeKind;
  label: string;
  detail?: string;
}

export interface UserMessageDisplay {
  body: string;
  badges: UserContextBadge[];
}

let badgeCounter = 0;

function nextBadgeId(prefix: string): string {
  badgeCounter += 1;
  return `${prefix}-${badgeCounter}`;
}

function presentationLabelFromSection(section: string): string {
  if (/\[presentation:\s*adaptive\]/i.test(section) || /Default to plain markdown prose/i.test(section)) {
    return 'Adaptive Rich UI';
  }
  if (
    /\[presentation:\s*always\]/i.test(section) ||
    /\[response_mode:\s*openui\]/i.test(section) ||
    /rich visual response/i.test(section)
  ) {
    return 'Rich UI';
  }
  if (/\[presentation:\s*off\]/i.test(section) || /\[response_mode:\s*text\]/i.test(section)) {
    return 'Plain text';
  }
  return 'Rich UI';
}

function isComputerUseEnabledDetail(detail: string): boolean {
  const normalized = detail.trim().toLowerCase();
  if (normalized.includes('off for this chat')) {
    return false;
  }
  return normalized.includes('session_enabled');
}

function extractActiveIntegrationSlots(content: string): string[] {
  const match = content.match(/Active integration slots for this message:\s*([^.]+)/i);
  if (!match?.[1]) {
    return [];
  }
  return match[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function pushBadge(
  badges: UserContextBadge[],
  badge: Omit<UserContextBadge, 'id'>,
): void {
  const duplicate = badges.some(
    (entry) => entry.kind === badge.kind && entry.label === badge.label && entry.detail === badge.detail,
  );
  if (duplicate) {
    return;
  }
  badges.push({ ...badge, id: nextBadgeId(badge.kind) });
}

function badgesFromInjectTags(tags: ParsedPromptInject[]): UserContextBadge[] {
  const badges: UserContextBadge[] = [];

  for (const parsed of tags) {
    switch (parsed.tag) {
      case 'rich-ui':
        pushBadge(badges, {
          kind: 'presentation',
          label: richUiBadgeLabel(parsed.attrs, parsed.content),
        });
        break;
      case 'computer-use':
        if (isComputerUseEnabledDetail(parsed.content)) {
          pushBadge(badges, {
            kind: 'computer_use',
            label: 'Computer Use',
            detail: parsed.content,
          });
        }
        break;
      case 'deep-research':
        pushBadge(badges, { kind: 'mode', label: 'Deep research' });
        break;
      case 'schedule-interview':
        pushBadge(badges, { kind: 'schedule', label: 'Schedule interview' });
        break;
      case 'integrations':
        for (const slot of extractActiveIntegrationSlots(parsed.content)) {
          pushBadge(badges, { kind: 'integration', label: slot });
        }
        break;
      case 'attachments':
        for (const item of parsed.content.split(',').map((entry) => entry.trim()).filter(Boolean)) {
          const name = item.split('/').pop() ?? item;
          pushBadge(badges, { kind: 'attachment', label: name, detail: item });
        }
        break;
      case 'skill':
        pushBadge(badges, { kind: 'skill', label: parsed.content || 'Skill' });
        break;
      case 'slash-command':
        pushBadge(badges, { kind: 'slash_command', label: parsed.content || '/command' });
        break;
      case 'continue':
        pushBadge(badges, { kind: 'continue', label: sessionContinueBadgeLabel() });
        break;
      default:
        pushBadge(badges, { kind: 'internal', label: parsed.tag });
        break;
    }
  }

  return badges;
}

export function mergeUserContextBadges(...groups: UserContextBadge[][]): UserContextBadge[] {
  const merged: UserContextBadge[] = [];
  for (const group of groups) {
    for (const badge of group) {
      pushBadge(merged, {
        kind: badge.kind,
        label: badge.label,
        detail: badge.detail,
      });
    }
  }
  return merged;
}

function stripKnownInjectionBlocks(raw: string, badges: UserContextBadge[]): string {
  let text = raw;

  const blockPatterns: Array<{
    pattern: RegExp;
    apply: (match: string) => void;
  }> = [
    {
      pattern: /<<jambu-presentation>>[\s\S]*?<<\/jambu-presentation>>/gi,
      apply: (match) => {
        pushBadge(badges, {
          kind: 'presentation',
          label: presentationLabelFromSection(match),
        });
      },
    },
    {
      pattern: /\[schedule_interview mode\][\s\S]*?(?=\n{2,}(?:\/|\[|<<|[A-Za-z0-9])|$)/gi,
      apply: () => {
        pushBadge(badges, { kind: 'schedule', label: 'Schedule interview' });
      },
    },
    {
      pattern:
        /(?:\[response_mode:\s*openui\]|The user requested a rich visual response\.)[\s\S]*?(?=\n{2,}(?:\/|\[computer_use:|\[mode:|\[active_integrations:|\[attachments:|[A-Za-z])|$)/gi,
      apply: (match) => {
        pushBadge(badges, {
          kind: 'presentation',
          label: presentationLabelFromSection(match),
        });
      },
    },
    {
      pattern:
        /(?:\[presentation:\s*adaptive\]|Rich UI is available for this workspace\.)[\s\S]*?(?=\n{2,}(?:\/|\[computer_use:|\[mode:|\[active_integrations:|\[attachments:|[A-Za-z])|$)/gi,
      apply: (match) => {
        pushBadge(badges, {
          kind: 'presentation',
          label: presentationLabelFromSection(match),
        });
      },
    },
    {
      pattern: /You are the Jambu runtime assistant\.[\s\S]*?(?=\n{2,}(?:\/|\[|<<|[A-Za-z0-9"])|$)/gi,
      apply: () => {
        pushBadge(badges, { kind: 'presentation', label: 'Rich UI' });
      },
    },
    {
      pattern: /## Syntax Rules[\s\S]*?(?=\n{2,}(?:\/|\[|<<|[A-Za-z0-9"])|$)/gi,
      apply: () => {
        pushBadge(badges, { kind: 'presentation', label: 'Rich UI' });
      },
    },
  ];

  for (const { pattern, apply } of blockPatterns) {
    text = text.replace(pattern, (match) => {
      apply(match);
      return '\n\n';
    });
  }

  const linePatterns: Array<{
    pattern: RegExp;
    apply: (match: RegExpMatchArray) => void;
  }> = [
    {
      pattern: /^\[computer_use:\s*([^\]]+)\]\s*$/gim,
      apply: (match) => {
        const detail = match[1]?.trim() ?? '';
        if (isComputerUseEnabledDetail(detail)) {
          pushBadge(badges, {
            kind: 'computer_use',
            label: 'Computer Use',
            detail,
          });
        }
      },
    },
    {
      pattern: /^\[mode:\s*([^\]]+)\]\s*$/gim,
      apply: (match) => {
        pushBadge(badges, {
          kind: 'mode',
          label: match[1]?.trim() === 'deep_research' ? 'Deep research' : match[1]?.trim() ?? 'Mode',
        });
      },
    },
    {
      pattern: /^\[(?:presentation|response_mode):\s*([^\]]+)\]\s*$/gim,
      apply: (match) => {
        const value = match[1]?.trim().toLowerCase() ?? '';
        const label =
          value === 'adaptive'
            ? 'Adaptive Rich UI'
            : value === 'always' || value === 'openui'
              ? 'Rich UI'
              : value === 'off' || value === 'text'
                ? 'Plain text'
                : 'Presentation';
        pushBadge(badges, { kind: 'presentation', label });
      },
    },
    {
      pattern: /^\[active_integrations:\s*([^\]]+)\]\s*$/gim,
      apply: (match) => {
        const items = match[1]?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
        for (const item of items) {
          pushBadge(badges, { kind: 'integration', label: item });
        }
      },
    },
    {
      pattern: /^\[attachments:\s*([^\]]+)\]\s*$/gim,
      apply: (match) => {
        const items = match[1]?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
        for (const item of items) {
          const name = item.split('/').pop() ?? item;
          pushBadge(badges, { kind: 'attachment', label: name, detail: item });
        }
      },
    },
    {
      pattern: /^\[skill:\s*([^\]]+)\]\s*$/gim,
      apply: (match) => {
        pushBadge(badges, { kind: 'skill', label: match[1]?.trim() ?? 'Skill' });
      },
    },
  ];

  for (const { pattern, apply } of linePatterns) {
    for (const match of text.matchAll(pattern)) {
      apply(match);
    }
    text = text.replace(pattern, '');
  }

  return stripPresentationArtifacts(text);
}

function extractLeadingSlashCommands(text: string, badges: UserContextBadge[]): string {
  let remainder = text.trim();

  while (remainder.length > 0) {
    const match = remainder.match(/^(\/[A-Za-z][\w:-]*)(?:\s+([\s\S]+))?$/);
    if (!match) {
      break;
    }

    pushBadge(badges, {
      kind: 'slash_command',
      label: match[1] ?? '/command',
    });

    if (!match[2]) {
      return '';
    }

    remainder = match[2].trim();
  }

  return remainder;
}

export function formatUserMessageForDisplay(raw: string): UserMessageDisplay {
  badgeCounter = 0;
  const badges: UserContextBadge[] = [];

  const envelopeStripped = stripCursorPromptEnvelope(raw);
  const tagged = stripPromptInjectTags(envelopeStripped);
  badges.push(...badgesFromInjectTags(tagged.tags));

  const legacyStripped = stripKnownInjectionBlocks(tagged.text, badges);
  const body = extractLeadingSlashCommands(legacyStripped, badges).trim();

  return {
    body: body.length > 0 ? body : badges.length > 0 ? '' : envelopeStripped.trim(),
    badges,
  };
}

export interface DispatchContextInput {
  message: string;
  mode?: 'default' | 'deep_research';
  computerUseEnabled?: boolean;
  computerUseMode?: string;
  integrationSlots?: string[];
  attachments?: Array<{ name?: string; path?: string }>;
  scheduleInterview?: boolean;
  presentationLabel?: string;
}

export function buildDispatchContextBadges(input: DispatchContextInput): UserContextBadge[] {
  badgeCounter = 0;
  const badges: UserContextBadge[] = [];
  extractLeadingSlashCommands(input.message, badges);

  if (input.presentationLabel) {
    pushBadge(badges, { kind: 'presentation', label: input.presentationLabel });
  }

  if (input.mode === 'deep_research') {
    pushBadge(badges, { kind: 'mode', label: 'Deep research' });
  }

  if (input.scheduleInterview) {
    pushBadge(badges, { kind: 'schedule', label: 'Schedule interview' });
  }

  if (input.computerUseEnabled) {
    const detail =
      input.computerUseMode === 'sandbox'
        ? 'Sandbox'
        : input.computerUseMode === 'host'
          ? 'My computer'
          : 'Enabled';
    pushBadge(badges, { kind: 'computer_use', label: 'Computer Use', detail });
  }

  for (const slot of input.integrationSlots ?? []) {
    pushBadge(badges, { kind: 'integration', label: slot });
  }

  for (const attachment of input.attachments ?? []) {
    const path = attachment.path ?? attachment.name ?? 'attachment';
    const name = path.split('/').pop() ?? path;
    pushBadge(badges, { kind: 'attachment', label: name, detail: path });
  }

  return badges;
}

export function displayBodyFromComposerMessage(message: string): string {
  return formatUserMessageForDisplay(message).body;
}
