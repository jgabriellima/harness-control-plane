import type { ContextWidgetsSnapshot } from './context-widgets';
import { readStaleSidebarCache, writeSidebarCache } from './sidebar-cache';

const CACHE_KEY = 'context-widgets';

let memorySnapshot: ContextWidgetsSnapshot | null = null;

export function readContextWidgetsCache(): ContextWidgetsSnapshot | null {
  if (memorySnapshot) {
    return memorySnapshot;
  }

  const cached = readStaleSidebarCache<ContextWidgetsSnapshot>(CACHE_KEY);
  if (cached) {
    memorySnapshot = cached;
  }
  return cached;
}

export function writeContextWidgetsCache(snapshot: ContextWidgetsSnapshot): void {
  memorySnapshot = snapshot;
  writeSidebarCache(CACHE_KEY, snapshot);
}
