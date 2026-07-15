import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { SecretStorage } from './credential-manifest';
import { resolveAppRoot } from './app-root';
import {
  desktopKeychainHas,
  desktopKeychainSet,
  isDesktopKeychainContext,
  readCredentialMetadata,
  writeCredentialMetadata,
} from './desktop-keychain';
import { activateRuntimeCredentialInProcess } from './runtime-credentials-activate';

const execFileAsync = promisify(execFile);

export interface CredentialPresence {
  env_var: string;
  storage: SecretStorage;
  required: boolean;
  description: string;
  present: boolean;
  saved_at?: string | null;
  updated_at?: string | null;
}

async function probePython(envVar: string, storage: SecretStorage, provider: string): Promise<boolean> {
  const script = `
import json, sys
from _business_secrets import credential_present
env, storage, provider = sys.argv[1], sys.argv[2], sys.argv[3]
print(json.dumps(credential_present(env, storage, provider=provider)))
`;
  const { stdout } = await execFileAsync(
    'python3',
    ['-c', script, envVar, storage, provider],
    { cwd: resolveAppRoot(), maxBuffer: 1024 * 1024, env: credentialProbeEnv() },
  );
  return JSON.parse(stdout.trim()) as boolean;
}

function credentialProbeEnv(): NodeJS.ProcessEnv {
  const bundleId =
    process.env.JAMBU_HOST_BUNDLE_ID?.trim() ||
    process.env.TAURI_BUNDLE_IDENTIFIER?.trim() ||
    '';
  if (!bundleId) {
    return process.env;
  }
  return {
    ...process.env,
    JAMBU_HOST_BUNDLE_ID: bundleId,
    TAURI_BUNDLE_IDENTIFIER: bundleId,
  };
}

async function probeKeychainPresence(envVar: string, storage: SecretStorage, provider: string): Promise<boolean> {
  if (storage === 'composio_connection') {
    if (isDesktopKeychainContext()) {
      return desktopKeychainHas(envVar);
    }
    try {
      return await probePython(envVar, storage, provider);
    } catch {
      return false;
    }
  }

  if (storage === 'runtime_env') {
    if (envVar === 'RUNTIME_API_KEY' || envVar === 'CURSOR_API_KEY') {
      return (
        Boolean(process.env.RUNTIME_API_KEY?.trim()) ||
        Boolean(process.env.CURSOR_API_KEY?.trim()) ||
        (isDesktopKeychainContext() ? await desktopKeychainHas(envVar) : false)
      );
    }
    return Boolean(process.env[envVar]?.trim());
  }

  if (isDesktopKeychainContext()) {
    return desktopKeychainHas(envVar);
  }

  try {
    return await probePython(envVar, storage, provider);
  } catch {
    return false;
  }
}

export async function probeCredentialPresence(
  entries: Array<{
    env_var: string;
    storage: SecretStorage;
    required: boolean;
    description: string;
  }>,
  provider: string,
): Promise<CredentialPresence[]> {
  const results: CredentialPresence[] = [];
  for (const entry of entries) {
    const present = await probeKeychainPresence(entry.env_var, entry.storage, provider);
    const metadata = present ? await readCredentialMetadata(entry.env_var) : null;
    results.push({
      ...entry,
      present,
      saved_at: metadata?.saved_at ?? null,
      updated_at: metadata?.updated_at ?? null,
    });
  }
  return results;
}

export async function storeCredential(envVar: string, value: string): Promise<CredentialPresence> {
  if (isDesktopKeychainContext()) {
    await desktopKeychainSet(envVar, value);
    const metadata = await writeCredentialMetadata(envVar);
    activateRuntimeCredentialInProcess(envVar, value);
    return {
      env_var: envVar,
      storage: 'keychain',
      required: true,
      description: envVar,
      present: true,
      saved_at: metadata.saved_at,
      updated_at: metadata.updated_at,
    };
  }

  const script = `
import sys
from _business_secrets import keychain_set
keychain_set(sys.argv[1], sys.argv[2])
`;
  await execFileAsync('python3', ['-c', script, envVar, value], {
    cwd: resolveAppRoot(),
    maxBuffer: 1024 * 1024,
    env: credentialProbeEnv(),
  });
  activateRuntimeCredentialInProcess(envVar, value);
  const metadata = await writeCredentialMetadata(envVar);
  return {
    env_var: envVar,
    storage: 'keychain',
    required: true,
    description: envVar,
    present: true,
    saved_at: metadata.saved_at,
    updated_at: metadata.updated_at,
  };
}
