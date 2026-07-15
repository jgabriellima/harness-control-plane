import { navigateShell, useShellPathname } from './shell-navigation';

/** Design routes share the orchestration shell navigation store (ADR-053 integration). */
export function navigateDesign(nextPath: string): void {
  const normalized = nextPath.startsWith('/') ? nextPath : `/design/${nextPath}`;
  navigateShell(normalized);
}

export function useDesignPathname(fallbackPathname = '/'): string {
  return useShellPathname(fallbackPathname);
}

export { useDesignRoute } from './design-navigation-hook';
