import { useSyncExternalStore } from 'react';

type NavigationListener = () => void;

const listeners = new Set<NavigationListener>();

function getPathname(): string {
  if (typeof window === 'undefined') {
    return '/';
  }
  return window.location.pathname;
}

let pathnameSnapshot = getPathname();

function emitNavigation(): void {
  for (const listener of listeners) {
    listener();
  }
}

function syncPathnameFromWindow(): void {
  pathnameSnapshot = getPathname();
}

export function conversationIdFromPath(pathname: string): string | null {
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

export function isChatRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/conversation/') ||
    pathname.startsWith('/design/conversation/')
  );
}

export function isLibraryRoute(pathname: string): boolean {
  return pathname === '/library' || pathname.startsWith('/library/');
}

export function isDesignRoute(pathname: string): boolean {
  return pathname === '/design' || pathname.startsWith('/design/');
}

export function isShellClientRoute(path: string): boolean {
  return (
    isChatRoute(path) ||
    isLibraryRoute(path) ||
    isDesignRoute(path) ||
    path.startsWith('/design/conversation/') ||
    path === '/executions' ||
    path.startsWith('/execution/') ||
    path === '/scheduled' ||
    path === '/settings' ||
    path.startsWith('/settings/')
  );
}

export function navigateShell(nextPath: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = nextPath.startsWith('/') ? nextPath : `/${nextPath}`;
  const url = new URL(window.location.href);
  url.pathname = normalized;

  if (url.pathname === pathnameSnapshot) {
    return;
  }

  window.history.pushState({}, '', url.toString());
  pathnameSnapshot = url.pathname;
  emitNavigation();
}

function subscribe(listener: NavigationListener): () => void {
  listeners.add(listener);

  if (typeof window === 'undefined') {
    return () => listeners.delete(listener);
  }

  const onPopState = (): void => {
    syncPathnameFromWindow();
    listener();
  };

  window.addEventListener('popstate', onPopState);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', onPopState);
  };
}

export function useShellPathname(fallbackPathname = '/'): string {
  return useSyncExternalStore(
    subscribe,
    () => pathnameSnapshot,
    () => fallbackPathname,
  );
}
