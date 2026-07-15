import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveAppRoot } from './app-root';
import { desktopKeychainGet, isDesktopKeychainContext } from './desktop-keychain';
import { activateRuntimeCredentialInProcess } from './runtime-credentials-activate';
import { resolveRuntimeApiKey } from './runtime-sdk-local';
import { runtimeLogger } from './runtime-logger';

const RUNTIME_KEY_ALIASES = ['RUNTIME_API_KEY', 'CURSOR_API_KEY'] as const;

async function readEnvFileValue(envVar: string): Promise<string | null> {
  const candidates = [
    join(resolveAppRoot(), '.env'),
    join(resolveAppRoot(), '..', '.env'),
    join(resolveAppRoot(), '..', 'business-workflow', 'app', '.env'),
  ];

  for (const path of candidates) {
    try {
      const raw = await readFile(path, 'utf8');
      const match = raw.match(new RegExp(`^${envVar}=(.+)$`, 'm'));
      const value = match?.[1]?.trim();
      if (value) {
        return value;
      }
    } catch {
      // try next candidate
    }
  }

  return null;
}

async function resolveStoredRuntimeKey(): Promise<string | null> {
  if (isDesktopKeychainContext()) {
    for (const envVar of RUNTIME_KEY_ALIASES) {
      const value = await desktopKeychainGet(envVar);
      if (value?.trim()) {
        return value.trim();
      }
    }
  }

  for (const envVar of RUNTIME_KEY_ALIASES) {
    const fromFile = await readEnvFileValue(envVar);
    if (fromFile) {
      return fromFile;
    }
  }

  return null;
}

/**
 * Reload runtime API key from keychain / env files into the active process.
 * Idempotent — safe to call before every availability probe or auth recovery.
 */
export async function reconcileRuntimeCredentials(): Promise<{
  applied: boolean;
  source: 'process' | 'keychain' | 'env_file' | 'none';
}> {
  const current = resolveRuntimeApiKey();
  const stored = await resolveStoredRuntimeKey();

  if (stored) {
    const changed = current !== stored;
    activateRuntimeCredentialInProcess('RUNTIME_API_KEY', stored);
    runtimeLogger.debug('runtime.credentials.reconcile', {
      applied: true,
      changed,
      source: isDesktopKeychainContext() ? 'keychain' : 'env_file',
    });
    return {
      applied: true,
      source: isDesktopKeychainContext() ? 'keychain' : 'env_file',
    };
  }

  if (current) {
    return { applied: false, source: 'process' };
  }

  runtimeLogger.warn('runtime.credentials.reconcile.missing', {});
  return { applied: false, source: 'none' };
}
