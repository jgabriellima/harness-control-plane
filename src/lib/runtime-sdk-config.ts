import type { LocalAgentStore } from '@cursor/sdk';

import { runtimeLogger } from './runtime-logger';

let sqliteAvailablePromise: Promise<boolean> | null = null;
const jsonlStores = new Map<string, LocalAgentStore>();

export async function nodeSqliteAvailable(): Promise<boolean> {
  if (!sqliteAvailablePromise) {
    sqliteAvailablePromise = import('node:sqlite')
      .then(() => true)
      .catch(() => false);
  }
  return sqliteAvailablePromise;
}

/**
 * Returns a JSONL-backed store when `node:sqlite` is unavailable.
 * When SQLite is available, returns undefined so the SDK uses its default backend.
 */
export async function resolveLocalAgentStore(
  workspaceCwd: string,
): Promise<LocalAgentStore | undefined> {
  if (await nodeSqliteAvailable()) {
    return undefined;
  }

  const key = workspaceCwd.trim();
  const existing = jsonlStores.get(key);
  if (existing) {
    return existing;
  }

  const { getDefaultSdkStateRoot, JsonlLocalAgentStore } = await import('@cursor/sdk');
  const store = new JsonlLocalAgentStore(getDefaultSdkStateRoot(key));
  jsonlStores.set(key, store);

  runtimeLogger.info('runtime.sdk.local_store.jsonl', {
    reason: 'node:sqlite_unavailable',
    workspace_cwd: key,
    state_root: getDefaultSdkStateRoot(key),
  });

  return store;
}

/** @internal test hook */
export function resetRuntimeSdkConfigForTests(): void {
  sqliteAvailablePromise = null;
  jsonlStores.clear();
}
