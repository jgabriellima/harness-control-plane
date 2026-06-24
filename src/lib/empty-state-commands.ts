const STORAGE_PREFIX = 'runtime-empty-state-hidden-commands';

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}:${projectId.trim() || 'default'}`;
}

function readHiddenSet(projectId: string): Set<string> {
  if (typeof window === 'undefined') {
    return new Set();
  }

  const raw = localStorage.getItem(storageKey(projectId));
  if (!raw) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'));
  } catch {
    return new Set();
  }
}

function writeHiddenSet(projectId: string, hidden: Set<string>): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(storageKey(projectId), JSON.stringify([...hidden]));
}

export function readHiddenEmptyStateCommands(projectId: string): Set<string> {
  return readHiddenSet(projectId);
}

export function hideEmptyStateCommand(projectId: string, command: string): void {
  const hidden = readHiddenSet(projectId);
  hidden.add(command);
  writeHiddenSet(projectId, hidden);
}

export function showEmptyStateCommand(projectId: string, command: string): void {
  const hidden = readHiddenSet(projectId);
  hidden.delete(command);
  writeHiddenSet(projectId, hidden);
}
