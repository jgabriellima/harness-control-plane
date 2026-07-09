import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import * as Sentry from '@sentry/astro';

export const BUNDLE_IDENTITY_FILENAME = 'bundle.identity.yaml';

export interface BundleIdentityMigration {
  import_keychain_from?: string[];
  import_app_data_from?: string[];
  tcc_reauth_required?: boolean;
}

export interface BundleIdentityManifest {
  apiVersion?: string;
  kind?: string;
  bundle_id: string;
  supersedes?: string[];
  migration?: BundleIdentityMigration;
}

export interface IdentityMigrationRecord {
  bundle_id: string;
  completed: boolean;
  keychain_keys_migrated: number;
  app_data_files_copied: number;
  source_services: string[];
  completed_at: string | null;
}

export interface IdentityMigrationSummary {
  configured: boolean;
  completed: boolean;
  bundleId: string | null;
  supersedes: string[];
  tccReauthRequired: boolean;
  keychainKeysMigrated: number | null;
  appDataFilesCopied: number | null;
  sourceServices: string[];
  completedAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function parseBundleIdentityManifest(raw: unknown): BundleIdentityManifest | null {
  if (!isRecord(raw)) {
    return null;
  }
  const bundleId = raw.bundle_id;
  if (typeof bundleId !== 'string' || !bundleId.trim()) {
    return null;
  }

  const migrationRaw = raw.migration;
  let migration: BundleIdentityMigration | undefined;
  if (isRecord(migrationRaw)) {
    migration = {
      import_keychain_from: parseStringArray(migrationRaw.import_keychain_from),
      import_app_data_from: parseStringArray(migrationRaw.import_app_data_from),
      tcc_reauth_required: migrationRaw.tcc_reauth_required === true,
    };
  }

  return {
    apiVersion: typeof raw.apiVersion === 'string' ? raw.apiVersion : undefined,
    kind: typeof raw.kind === 'string' ? raw.kind : undefined,
    bundle_id: bundleId.trim(),
    supersedes: parseStringArray(raw.supersedes),
    migration,
  };
}

export async function loadBundleIdentityManifest(
  workspaceRoot: string,
): Promise<BundleIdentityManifest | null> {
  const path = join(workspaceRoot, BUNDLE_IDENTITY_FILENAME);
  if (!existsSync(path)) {
    return null;
  }

  return Sentry.startSpan({ name: 'loadBundleIdentityManifest', op: 'fs.read' }, async () => {
    const raw = await readFile(path, 'utf8');
    return parseBundleIdentityManifest(parseYaml(raw));
  });
}

function migrationRecordPath(appDataDir: string, bundleId: string): string {
  return join(appDataDir, 'migrations', `identity-${bundleId}.json`);
}

export async function loadIdentityMigrationRecord(
  bundleId: string,
): Promise<IdentityMigrationRecord | null> {
  const appDataDir = process.env.TAURI_APP_DATA_DIR?.trim();
  if (!appDataDir) {
    return null;
  }

  const path = migrationRecordPath(appDataDir, bundleId);
  if (!existsSync(path)) {
    return null;
  }

  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.completed !== true) {
      return null;
    }
    return {
      bundle_id: typeof parsed.bundle_id === 'string' ? parsed.bundle_id : bundleId,
      completed: true,
      keychain_keys_migrated:
        typeof parsed.keychain_keys_migrated === 'number' ? parsed.keychain_keys_migrated : 0,
      app_data_files_copied:
        typeof parsed.app_data_files_copied === 'number' ? parsed.app_data_files_copied : 0,
      source_services: parseStringArray(parsed.source_services),
      completed_at: typeof parsed.completed_at === 'string' ? parsed.completed_at : null,
    };
  } catch {
    return null;
  }
}

export async function loadIdentityMigrationSummary(
  workspaceRoot: string,
): Promise<IdentityMigrationSummary | null> {
  const manifest = await loadBundleIdentityManifest(workspaceRoot);
  if (!manifest) {
    return null;
  }

  const supersedes = manifest.supersedes ?? [];
  const hasMigrationSources =
    supersedes.length > 0 ||
    (manifest.migration?.import_keychain_from?.length ?? 0) > 0 ||
    (manifest.migration?.import_app_data_from?.length ?? 0) > 0;

  if (!hasMigrationSources) {
    return null;
  }

  const record = await loadIdentityMigrationRecord(manifest.bundle_id);

  return {
    configured: true,
    completed: record?.completed ?? false,
    bundleId: manifest.bundle_id,
    supersedes,
    tccReauthRequired: manifest.migration?.tcc_reauth_required === true,
    keychainKeysMigrated: record?.keychain_keys_migrated ?? null,
    appDataFilesCopied: record?.app_data_files_copied ?? null,
    sourceServices: record?.source_services ?? [],
    completedAt: record?.completed_at ?? null,
  };
}
