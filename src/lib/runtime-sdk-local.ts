import type { GetRunOptions } from '@cursor/sdk';

import { resolveLocalAgentStore } from './runtime-sdk-config';

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

/**
 * Mirror the resolved runtime key into both env aliases before SDK spawns
 * cursor-agent. The parent process may hold the key only on AgentOptions while
 * the CLI subprocess reads CURSOR_API_KEY from its environment.
 */
export function ensureRuntimeApiKeyInProcessEnv(): string | undefined {
  const apiKey = resolveRuntimeApiKey();
  if (!apiKey) {
    return undefined;
  }

  for (const key of ['RUNTIME_API_KEY', 'CURSOR_API_KEY'] as const) {
    if (process.env[key]?.trim() !== apiKey) {
      process.env[key] = apiKey;
    }
  }

  return apiKey;
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
export async function localGetRunOptions(
  cwd: string,
): Promise<Extract<GetRunOptions, { runtime?: 'local' }>> {
  requireRuntimeApiKey();
  const store = await resolveLocalAgentStore(cwd);
  return {
    runtime: 'local',
    cwd,
    ...(store ? { store } : {}),
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
