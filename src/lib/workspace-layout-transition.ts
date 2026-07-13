import { DRAFT_CONVERSATION_ID } from './draft-conversation';
import { conversationIdFromPath, isChatRoute } from './shell-navigation';
import type { WorkspaceLayoutMode } from './runtime-hub-types';

function paneCountForMode(mode: WorkspaceLayoutMode): number {
  switch (mode) {
    case 'split-2':
      return 2;
    case 'grid-4':
      return 4;
    default:
      return 1;
  }
}

export function normalizePaneIds(panes: string[], mode: WorkspaceLayoutMode): string[] {
  const count = paneCountForMode(mode);
  const next = panes.slice(0, count);
  while (next.length < count) {
    next.push('');
  }
  return next;
}

export function resolveActiveConversationForLayout(
  pathname: string,
  foregroundId: string | null,
  paneIds: string[],
): string {
  const fromPath = conversationIdFromPath(pathname);
  if (fromPath) {
    return fromPath;
  }

  if (foregroundId) {
    return foregroundId;
  }

  const occupiedPane = paneIds.find((id) => id.length > 0);
  if (occupiedPane) {
    return occupiedPane;
  }

  if (isChatRoute(pathname)) {
    return DRAFT_CONVERSATION_ID;
  }

  return '';
}

export function buildPanesForLayoutTransition(
  nextMode: WorkspaceLayoutMode,
  previousMode: WorkspaceLayoutMode,
  currentPanes: string[],
  pathname: string,
  foregroundId: string | null,
): string[] {
  if (nextMode === 'single') {
    return [];
  }

  const next = normalizePaneIds(currentPanes, nextMode);
  const hasOccupiedPane = next.some((id) => id.length > 0);

  if (!hasOccupiedPane || previousMode === 'single') {
    const active = resolveActiveConversationForLayout(pathname, foregroundId, currentPanes);
    if (active) {
      next[0] = active;
    }
  }

  return next;
}
