export function isKnownSlashCommand(message: string, knownCommands: readonly string[]): boolean {
  const trimmed = message.trim();
  if (!trimmed.startsWith('/')) {
    return true;
  }

  const firstToken = trimmed.split(/\s/)[0] ?? '';
  if (firstToken === '/') {
    return false;
  }

  return knownCommands.some(
    (cmd) => cmd === firstToken || cmd.startsWith(firstToken) || firstToken.startsWith(cmd),
  );
}

export function isUnknownSlashCommand(message: string, knownCommands: readonly string[]): boolean {
  return !isKnownSlashCommand(message, knownCommands);
}
