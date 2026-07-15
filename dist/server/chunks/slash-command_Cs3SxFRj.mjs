const BUILTIN_SLASH_COMMANDS = ["/openui"];
function isKnownSlashCommand(message, knownCommands) {
  const trimmed = message.trim();
  if (!trimmed.startsWith("/")) {
    return true;
  }
  const firstToken = trimmed.split(/\s/)[0] ?? "";
  if (firstToken === "/") {
    return false;
  }
  if (BUILTIN_SLASH_COMMANDS.some((cmd) => cmd === firstToken || firstToken.startsWith(cmd))) {
    return true;
  }
  return knownCommands.some(
    (cmd) => cmd === firstToken || cmd.startsWith(firstToken) || firstToken.startsWith(cmd)
  );
}
function isUnknownSlashCommand(message, knownCommands) {
  return !isKnownSlashCommand(message, knownCommands);
}

export { isUnknownSlashCommand as a, isKnownSlashCommand as i };
