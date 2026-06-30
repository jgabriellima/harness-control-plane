import type { GetRunOptions } from '@cursor/sdk';

/**
 * Resolves CURSOR_API_KEY for local SDK calls. Throws when unset.
 */
export function requireCursorApiKey(): string {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('CURSOR_API_KEY is required');
  }
  return apiKey;
}

/**
 * Options for Agent.getRun against the local agent store.
 * Caller must pass harness workspace cwd — never rely on process.cwd() alone.
 */
export function localGetRunOptions(cwd: string): Extract<GetRunOptions, { runtime?: 'local' }> {
  requireCursorApiKey();
  return {
    runtime: 'local',
    cwd,
  };
}
