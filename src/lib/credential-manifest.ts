import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { resolveHarnessBinding } from './harness-binding';

export type SecretStorage = 'keychain' | 'runtime_env' | 'cli_session';

export interface CredentialManifestEntry {
  env_var: string;
  scope: string;
  storage: SecretStorage;
  slot_id: string;
  provider: string;
  integration: string;
  required: boolean;
  description: string;
}

export interface CredentialManifest {
  generated_at: string;
  source: string;
  secrets: CredentialManifestEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function loadCredentialManifest(): Promise<CredentialManifest | null> {
  const binding = await resolveHarnessBinding();
  const manifestPath = join(binding.harnessRoot, 'credential-manifest.yaml');
  try {
    const raw = await readFile(manifestPath, 'utf8');
    const parsed = parseYaml(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.secrets)) {
      return null;
    }

    const secrets = parsed.secrets
      .filter(isRecord)
      .map((entry) => ({
        env_var: typeof entry.env_var === 'string' ? entry.env_var : '',
        scope: typeof entry.scope === 'string' ? entry.scope : 'local',
        storage:
          entry.storage === 'runtime_env' || entry.storage === 'cli_session'
            ? entry.storage
            : 'keychain',
        slot_id: typeof entry.slot_id === 'string' ? entry.slot_id : '',
        provider: typeof entry.provider === 'string' ? entry.provider : '',
        integration: typeof entry.integration === 'string' ? entry.integration : '',
        required: entry.required !== false,
        description: typeof entry.description === 'string' ? entry.description : '',
      }))
      .filter((entry) => entry.env_var.length > 0 && entry.slot_id.length > 0);

    return {
      generated_at: typeof parsed.generated_at === 'string' ? parsed.generated_at : '',
      source: typeof parsed.source === 'string' ? parsed.source : 'unknown',
      secrets,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export function groupSecretsBySlot(
  manifest: CredentialManifest,
): Map<string, CredentialManifestEntry[]> {
  const grouped = new Map<string, CredentialManifestEntry[]>();
  for (const entry of manifest.secrets) {
    const list = grouped.get(entry.slot_id) ?? [];
    list.push(entry);
    grouped.set(entry.slot_id, list);
  }
  return grouped;
}
