import { useSyncExternalStore } from 'react';

import { parseDesignRoute } from './design-navigation';

type NavigationListener = () => void;

const listeners = new Set<NavigationListener>();

function getPathname(): string {
  if (typeof window === 'undefined') {
    return '/design';
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

export function navigateDesign(nextPath: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = nextPath.startsWith('/') ? nextPath : `/design/${nextPath}`;
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

export function useDesignPathname(fallbackPathname = '/design'): string {
  return useSyncExternalStore(
    subscribe,
    () => pathnameSnapshot,
    () => fallbackPathname,
  );
}

export function useDesignRoute(fallbackPathname = '/design') {
  const pathname = useDesignPathname(fallbackPathname);
  return parseDesignRoute(pathname);
}
