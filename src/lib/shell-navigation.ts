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
  const match = pathname.match(/^\/conversation\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function isChatRoute(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/conversation/');
}

export function isShellClientRoute(path: string): boolean {
  return (
    isChatRoute(path) ||
    path === '/executions' ||
    path.startsWith('/execution/') ||
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
