import { isDesignRoute } from './shell-navigation';

/** Canonical conversation path for the unified app shell. */
export function appConversationPath(conversationId: string): string {
  return `/design/conversation/${encodeURIComponent(conversationId)}`;
}

export function appDraftChatPath(): string {
  return '/';
}

export function shellLibraryPath(pathname: string): string {
  return isDesignRoute(pathname) ? '/design/library' : '/library';
}

export function shellScheduledPath(pathname: string): string {
  return isDesignRoute(pathname) ? '/design/scheduled' : '/scheduled';
}

export function shellExecutionsPath(pathname: string): string {
  return isDesignRoute(pathname) ? '/design/executions' : '/executions';
}

export function shellConversationsPath(pathname: string): string {
  return isDesignRoute(pathname) ? '/design/conversations' : '/';
}

export function shellConversationPath(pathname: string, conversationId: string): string {
  return appConversationPath(conversationId);
}

export function shellHomePath(pathname: string): string {
  return isDesignRoute(pathname) ? '/design/projects' : '/';
}

export function isShellLibraryActive(pathname: string): boolean {
  return (
    pathname === '/library' ||
    pathname.startsWith('/library/') ||
    pathname === '/design/library' ||
    pathname.startsWith('/design/library/')
  );
}

export function isShellScheduledActive(pathname: string): boolean {
  return pathname === '/scheduled' || pathname === '/design/scheduled';
}

export function isShellExecutionsActive(pathname: string): boolean {
  return (
    pathname === '/executions' ||
    pathname.startsWith('/execution/') ||
    pathname === '/design/executions' ||
    pathname.startsWith('/design/execution/')
  );
}

export function isShellDesignStudioActive(pathname: string): boolean {
  return isDesignRoute(pathname);
}

export function conversationIdFromShellPath(pathname: string): string | null {
  const harnessMatch = pathname.match(/^\/conversation\/([^/]+)/);
  if (harnessMatch?.[1]) {
    return decodeURIComponent(harnessMatch[1]);
  }
  const designMatch = pathname.match(/^\/design\/conversation\/([^/]+)/);
  if (designMatch?.[1]) {
    return decodeURIComponent(designMatch[1]);
  }
  return null;
}

export function isShellChatActive(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname.startsWith('/conversation/') ||
    pathname.startsWith('/design/conversation/')
  );
}
