import { useEffect } from 'react';
import type { RefObject } from 'react';

import { DECK_STUDIO_WIDTH } from '@/lib/design-studio-surface';

/**
 * Scale a fixed-width deck iframe to fit its container.
 * Publishes `--deck-studio-scale` on the frame element (width / 1920).
 */
export function useDeckStudioScale(
  frameRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const element = frameRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    const apply = () => {
      const width = element.clientWidth;
      if (width > 0) {
        element.style.setProperty('--deck-studio-scale', String(width / DECK_STUDIO_WIDTH));
      }
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, [frameRef, enabled]);
}
