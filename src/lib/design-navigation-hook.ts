import { parseDesignRoute } from './design-navigation';
import { useShellPathname } from './shell-navigation';

export function useDesignRoute(fallbackPathname = '/') {
  const pathname = useShellPathname(fallbackPathname);
  return parseDesignRoute(pathname);
}
