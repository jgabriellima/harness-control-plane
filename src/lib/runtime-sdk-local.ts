import type { GetRunOptions } from '@cursor/sdk';

/**
 * Resolves the runtime API key for local SDK calls.
 * User-facing storage key: RUNTIME_API_KEY (keychain / Settings).
 * SDK wire name: CURSOR_API_KEY (injected by sidecar alias).
 */
export function resolveRuntimeApiKey(): string | undefined {
  const runtimeKey = process.env.RUNTIME_API_KEY?.trim();
  if (runtimeKey) {
    return runtimeKey;
  }
  return process.env.CURSOR_API_KEY?.trim() || undefined;
}

export function hasRuntimeApiKey(): boolean {
  return Boolean(resolveRuntimeApiKey());
}

/** Gate for local SDK calls (Agent.getRun, stream fanout, etc.). */
export function hasRuntimeSdkCredentials(): boolean {
  return hasRuntimeApiKey();
}

export function requireRuntimeApiKey(): string {
  const apiKey = resolveRuntimeApiKey();
  if (!apiKey) {
    throw new Error('RUNTIME_API_KEY is required');
  }
  return apiKey;
}

/**
 * Options for Agent.getRun against the local agent store.
 * Caller must pass harness workspace cwd — never rely on process.cwd() alone.
 */
export function localGetRunOptions(cwd: string): Extract<GetRunOptions, { runtime?: 'local' }> {
  requireRuntimeApiKey();
  return {
    runtime: 'local',
    cwd,
  };
}

/** @deprecated Use resolveRuntimeApiKey */
export function hasCursorApiKey(): boolean {
  return hasRuntimeApiKey();
}

/** @deprecated Use requireRuntimeApiKey */
export function requireCursorApiKey(): string {
  return requireRuntimeApiKey();
}
