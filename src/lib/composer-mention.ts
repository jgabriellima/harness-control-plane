export interface FileMentionSuggestion {
  path: string;
  name: string;
  source: 'upload' | 'output' | 'playbook-artifact' | 'thread';
}

const ACTIVE_MENTION_PATTERN = /@([^\s@]*)$/;

/** Return the query token after the trailing `@`, or null when no active mention. */
export function parseActiveFileMention(input: string): string | null {
  const match = input.match(ACTIVE_MENTION_PATTERN);
  return match?.[1] ?? null;
}

/** Replace the trailing `@query` segment with `@replacement `, or remove it when replacement is empty. */
export function replaceActiveFileMention(input: string, replacement: string): string {
  if (replacement.trim().length === 0) {
    return input.replace(ACTIVE_MENTION_PATTERN, '');
  }

  return input.replace(ACTIVE_MENTION_PATTERN, `@${replacement} `);
}

/** Remove the trailing `@query` segment without inserting replacement text. */
export function clearActiveFileMention(input: string): string {
  return replaceActiveFileMention(input, '');
}

const ACTIVE_SLASH_PATTERN = /(?:^|\s)(\/[^\s]*)$/;

/** Return the trailing slash command token, or null when no active slash query. */
export function parseActiveSlashQuery(input: string): string | null {
  const match = input.match(ACTIVE_SLASH_PATTERN);
  return match?.[1] ?? null;
}

/** True when the composer ends with an in-progress slash command token. */
export function isActiveSlashQuery(input: string): boolean {
  return parseActiveSlashQuery(input) !== null;
}

/** Clear the active trailing slash token after it is promoted to a badge. */
export function clearActiveSlashQuery(input: string): string {
  const match = input.match(ACTIVE_SLASH_PATTERN);
  if (!match) {
    return input;
  }

  const prefix = input.slice(0, input.length - match[0].length);
  return prefix.trimEnd();
}

export interface SlashCommandCandidate {
  command: string;
  description?: string;
}

export function rankSlashCommandSuggestions<T extends SlashCommandCandidate>(
  commands: T[],
  query: string,
  limit = 50,
): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  const queryBody = normalizedQuery.replace(/^\//, '');

  const scored = commands.map((item) => {
    const command = item.command.toLowerCase();
    const commandBody = command.replace(/^\//, '');
    let score = 0;

    if (!normalizedQuery || normalizedQuery === '/') {
      score = 10;
    } else if (command === normalizedQuery) {
      score = 100;
    } else if (command.startsWith(normalizedQuery)) {
      score = 90;
    } else if (commandBody.startsWith(queryBody)) {
      score = 85;
    } else if (queryBody.length >= 2 && commandBody.includes(queryBody)) {
      score = 70;
    } else {
      const segments = queryBody.split(/[:/]/).filter((segment) => segment.length > 0);
      if (segments.length > 0 && segments.every((segment) => commandBody.includes(segment))) {
        score = 55;
      }
    }

    return { item, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.item.command.localeCompare(right.item.command);
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function addComposerFileMention(
  mentions: FileMentionSuggestion[],
  file: FileMentionSuggestion,
): FileMentionSuggestion[] {
  if (mentions.some((item) => item.path === file.path)) {
    return mentions;
  }

  return [...mentions, file];
}

export function removeComposerFileMention(
  mentions: FileMentionSuggestion[],
  path: string,
): FileMentionSuggestion[] {
  return mentions.filter((item) => item.path !== path);
}

export function buildComposerSubmitMessage(
  input: string,
  mentions: FileMentionSuggestion[],
  slashCommand?: string | null,
): string {
  const trimmed = input.trim();
  const mentionTokens = mentions.map((file) => `@${file.name}`).join(' ');
  const parts: string[] = [];

  if (slashCommand?.trim()) {
    parts.push(slashCommand.trim());
  }

  if (trimmed) {
    parts.push(trimmed);
  }

  if (mentionTokens) {
    parts.push(mentionTokens);
  }

  return parts.join(' ').trim();
}

export function composerHasSubmittableContent(
  input: string,
  mentions: FileMentionSuggestion[],
  slashCommand?: string | null,
): boolean {
  return input.trim().length > 0 || mentions.length > 0 || Boolean(slashCommand?.trim());
}

export function rankFileMentionSuggestions(
  files: FileMentionSuggestion[],
  query: string,
  limit = 20,
): FileMentionSuggestion[] {
  const normalizedQuery = query.trim().toLowerCase();

  const scored = files.map((file) => {
    const name = file.name.toLowerCase();
    const path = file.path.toLowerCase();
    let score = 0;

    if (!normalizedQuery) {
      score = file.source === 'thread' ? 30 : 10;
    } else if (name === normalizedQuery) {
      score = 100;
    } else if (name.startsWith(normalizedQuery)) {
      score = 80;
    } else if (path.includes(normalizedQuery)) {
      score = 50;
    } else if (name.includes(normalizedQuery)) {
      score = 40;
    }

    if (file.source === 'thread') {
      score += 5;
    }

    return { file, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.file.name.localeCompare(right.file.name);
    })
    .slice(0, limit)
    .map((entry) => entry.file);
}
