const BUILTIN_SLASH_COMMANDS = ['/openui'] as const;

export function isKnownSlashCommand(message: string, knownCommands: readonly string[]): boolean {
  const trimmed = message.trim();
  if (!trimmed.startsWith('/')) {
    return true;
  }

  const firstToken = trimmed.split(/\s/)[0] ?? '';
  if (firstToken === '/') {
    return false;
  }

  if (BUILTIN_SLASH_COMMANDS.some((cmd) => cmd === firstToken || firstToken.startsWith(cmd))) {
    return true;
  }

  return knownCommands.some(
    (cmd) => cmd === firstToken || cmd.startsWith(firstToken) || firstToken.startsWith(cmd),
  );
}

export function isUnknownSlashCommand(message: string, knownCommands: readonly string[]): boolean {
  return !isKnownSlashCommand(message, knownCommands);
}
