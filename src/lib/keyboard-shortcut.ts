export interface ParsedKeyboardShortcut {
  mod: boolean;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  key: string;
}

const MOD_TOKEN = 'mod';

/**
 * Parse a shortcut string such as `Mod+Shift+V` or `Alt+KeyV`.
 * `Mod` maps to Meta on macOS and Control elsewhere.
 */
export function parseKeyboardShortcut(raw: string): ParsedKeyboardShortcut | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  const keyToken = parts[parts.length - 1] ?? '';
  const key = keyToken.length === 1 ? keyToken.toLowerCase() : keyToken.toLowerCase();
  if (!key) {
    return null;
  }

  let mod = false;
  let shift = false;
  let alt = false;
  let ctrl = false;

  for (const token of parts.slice(0, -1)) {
    const normalized = token.toLowerCase();
    if (normalized === MOD_TOKEN) {
      mod = true;
      continue;
    }
    if (normalized === 'shift') {
      shift = true;
      continue;
    }
    if (normalized === 'alt' || normalized === 'option') {
      alt = true;
      continue;
    }
    if (normalized === 'ctrl' || normalized === 'control') {
      ctrl = true;
      continue;
    }
    if (normalized === 'meta' || normalized === 'cmd' || normalized === 'command') {
      mod = true;
      continue;
    }
    return null;
  }

  return { mod, shift, alt, ctrl, key };
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
}

export function matchesKeyboardShortcut(
  event: KeyboardEvent,
  shortcut: ParsedKeyboardShortcut,
): boolean {
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
  if (eventKey !== shortcut.key) {
    return false;
  }

  if (shortcut.shift !== event.shiftKey) {
    return false;
  }
  if (shortcut.alt !== event.altKey) {
    return false;
  }

  const modPressed = isMacPlatform() ? event.metaKey : event.ctrlKey;
  const ctrlPressed = event.ctrlKey;
  const metaPressed = event.metaKey;

  if (shortcut.mod) {
    if (!modPressed) {
      return false;
    }
  } else if (shortcut.ctrl) {
    if (!ctrlPressed) {
      return false;
    }
  } else if (modPressed || ctrlPressed || metaPressed) {
    return false;
  }

  return true;
}

export function formatKeyboardShortcut(raw: string): string {
  const parsed = parseKeyboardShortcut(raw);
  if (!parsed) {
    return raw;
  }

  const isMac = isMacPlatform();
  const parts: string[] = [];
  if (parsed.mod) {
    parts.push(isMac ? '⌘' : 'Ctrl');
  } else if (parsed.ctrl) {
    parts.push('Ctrl');
  }
  if (parsed.shift) {
    parts.push(isMac ? '⇧' : 'Shift');
  }
  if (parsed.alt) {
    parts.push(isMac ? '⌥' : 'Alt');
  }
  parts.push(parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key);
  return parts.join(isMac ? '' : '+');
}
