import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { SecretStorage } from './credential-manifest';
import { resolveAppRoot } from './app-root';

const execFileAsync = promisify(execFile);

export interface CredentialPresence {
  env_var: string;
  storage: SecretStorage;
  required: boolean;
  description: string;
  present: boolean;
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
    { cwd: resolveAppRoot(), maxBuffer: 1024 * 1024 },
  );
  return JSON.parse(stdout.trim()) as boolean;
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
    let present = false;
    if (entry.storage === 'runtime_env') {
      present = Boolean(process.env[entry.env_var]?.trim());
    } else {
      try {
        present = await probePython(entry.env_var, entry.storage, provider);
      } catch {
        present = false;
      }
    }
    results.push({ ...entry, present });
  }
  return results;
}

export async function storeCredential(envVar: string, value: string): Promise<void> {
  const script = `
import sys
from _business_secrets import keychain_set
keychain_set(sys.argv[1], sys.argv[2])
`;
  await execFileAsync('python3', ['-c', script, envVar, value], {
    cwd: resolveAppRoot(),
    maxBuffer: 1024 * 1024,
  });
}
