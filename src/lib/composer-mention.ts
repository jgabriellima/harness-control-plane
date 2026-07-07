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

/** Replace the trailing `@query` segment with `@replacement `. */
export function replaceActiveFileMention(input: string, replacement: string): string {
  return input.replace(ACTIVE_MENTION_PATTERN, `@${replacement} `);
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
