const CACHE_PREFIX = 'sidebar:';
const DEFAULT_TTL_MS = 60_000;

interface SidebarCacheEntry<T> {
  data: T;
  fetchedAt: number;
}

function cacheKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

export function readSidebarCache<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(cacheKey(key));
    if (!raw) {
      return null;
    }

    const entry = JSON.parse(raw) as SidebarCacheEntry<T>;
    if (Date.now() - entry.fetchedAt > ttlMs) {
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

export function readStaleSidebarCache<T>(key: string): T | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(cacheKey(key));
    if (!raw) {
      return null;
    }

    const entry = JSON.parse(raw) as SidebarCacheEntry<T>;
    return entry.data;
  } catch {
    return null;
  }
}

export function writeSidebarCache<T>(key: string, data: T): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    const entry: SidebarCacheEntry<T> = {
      data,
      fetchedAt: Date.now(),
    };
    sessionStorage.setItem(cacheKey(key), JSON.stringify(entry));
  } catch {
    // Ignore quota or serialization errors — cache is best-effort.
  }
}

export function invalidateSidebarCache(key: string): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    sessionStorage.removeItem(cacheKey(key));
  } catch {
    // Ignore.
  }
}
