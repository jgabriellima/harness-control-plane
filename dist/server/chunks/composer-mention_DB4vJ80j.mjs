const ACTIVE_MENTION_PATTERN = /@([^\s@]*)$/;
function parseActiveFileMention(input) {
  const match = input.match(ACTIVE_MENTION_PATTERN);
  return match?.[1] ?? null;
}
function replaceActiveFileMention(input, replacement) {
  if (replacement.trim().length === 0) {
    return input.replace(ACTIVE_MENTION_PATTERN, "");
  }
  return input.replace(ACTIVE_MENTION_PATTERN, `@${replacement} `);
}
function clearActiveFileMention(input) {
  return replaceActiveFileMention(input, "");
}
const ACTIVE_SLASH_PATTERN = /(?:^|\s)(\/[^\s]*)$/;
function parseActiveSlashQuery(input) {
  const match = input.match(ACTIVE_SLASH_PATTERN);
  return match?.[1] ?? null;
}
function clearActiveSlashQuery(input) {
  const match = input.match(ACTIVE_SLASH_PATTERN);
  if (!match) {
    return input;
  }
  const prefix = input.slice(0, input.length - match[0].length);
  return prefix.trimEnd();
}
function rankSlashCommandSuggestions(commands, query, limit = 50) {
  const normalizedQuery = query.trim().toLowerCase();
  const queryBody = normalizedQuery.replace(/^\//, "");
  const scored = commands.map((item) => {
    const command = item.command.toLowerCase();
    const commandBody = command.replace(/^\//, "");
    let score = 0;
    if (!normalizedQuery || normalizedQuery === "/") {
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
  return scored.filter((entry) => entry.score > 0).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.item.command.localeCompare(right.item.command);
  }).slice(0, limit).map((entry) => entry.item);
}
function addComposerFileMention(mentions, file) {
  if (mentions.some((item) => item.path === file.path)) {
    return mentions;
  }
  return [...mentions, file];
}
function removeComposerFileMention(mentions, path) {
  return mentions.filter((item) => item.path !== path);
}
function buildComposerSubmitMessage(input, mentions, slashCommand) {
  const trimmed = input.trim();
  const mentionTokens = mentions.map((file) => `@${file.name}`).join(" ");
  const parts = [];
  if (slashCommand?.trim()) {
    parts.push(slashCommand.trim());
  }
  if (trimmed) {
    parts.push(trimmed);
  }
  if (mentionTokens) {
    parts.push(mentionTokens);
  }
  return parts.join(" ").trim();
}
function composerHasSubmittableContent(input, mentions, slashCommand) {
  return input.trim().length > 0 || mentions.length > 0 || Boolean(slashCommand?.trim());
}
function rankFileMentionSuggestions(files, query, limit = 20) {
  const normalizedQuery = query.trim().toLowerCase();
  const scored = files.map((file) => {
    const name = file.name.toLowerCase();
    const path = file.path.toLowerCase();
    let score = 0;
    if (!normalizedQuery) {
      score = file.source === "thread" ? 30 : 10;
    } else if (name === normalizedQuery) {
      score = 100;
    } else if (name.startsWith(normalizedQuery)) {
      score = 80;
    } else if (path.includes(normalizedQuery)) {
      score = 50;
    } else if (name.includes(normalizedQuery)) {
      score = 40;
    }
    if (file.source === "thread") {
      score += 5;
    }
    return { file, score };
  });
  return scored.filter((entry) => entry.score > 0).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.file.name.localeCompare(right.file.name);
  }).slice(0, limit).map((entry) => entry.file);
}

export { rankSlashCommandSuggestions as a, parseActiveFileMention as b, composerHasSubmittableContent as c, clearActiveSlashQuery as d, clearActiveFileMention as e, addComposerFileMention as f, removeComposerFileMention as g, buildComposerSubmitMessage as h, parseActiveSlashQuery as p, rankFileMentionSuggestions as r };
