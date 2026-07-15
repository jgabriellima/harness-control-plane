import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  keychainServiceCandidates,
  LEGACY_KEYCHAIN_SERVICE,
  resolveKeychainService,
} from './keychain-service';

const execFileAsync = promisify(execFile);

export interface CredentialMetadata {
  env_var: string;
  saved_at: string;
  updated_at: string;
}

interface MetadataStore {
  credentials: Record<string, { saved_at: string; updated_at: string }>;
}

async function primaryKeychainService(): Promise<string> {
  return resolveKeychainService();
}

async function metadataDir(): Promise<string> {
  const appData = process.env.TAURI_APP_DATA_DIR?.trim();
  if (appData) {
    return appData;
  }
  const bundleId = await primaryKeychainService();
  const home = process.env.HOME?.trim();
  if (!home) {
    throw new Error('Cannot resolve credential metadata directory');
  }
  return join(home, 'Library', 'Application Support', bundleId);
}

async function metadataPath(): Promise<string> {
  return join(await metadataDir(), 'credential-metadata.json');
}

export function isDesktopKeychainContext(): boolean {
  return (
    process.env.CONTROL_PLANE_DESKTOP === '1' ||
    Boolean(process.env.TAURI_BUNDLE_IDENTIFIER?.trim()) ||
    Boolean(process.env.JAMBU_HOST_BUNDLE_ID?.trim())
  );
}

async function readMetadataStore(): Promise<MetadataStore> {
  try {
    const raw = await readFile(await metadataPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<MetadataStore>;
    if (parsed && typeof parsed === 'object' && parsed.credentials && typeof parsed.credentials === 'object') {
      return { credentials: parsed.credentials };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  return { credentials: {} };
}

export async function readCredentialMetadata(envVar: string): Promise<CredentialMetadata | null> {
  const store = await readMetadataStore();
  const entry = store.credentials[envVar];
  if (!entry) {
    return null;
  }
  return {
    env_var: envVar,
    saved_at: entry.saved_at,
    updated_at: entry.updated_at,
  };
}

export async function writeCredentialMetadata(envVar: string): Promise<CredentialMetadata> {
  const now = new Date().toISOString();
  const dir = await metadataDir();
  await mkdir(dir, { recursive: true });
  const store = await readMetadataStore();
  const existing = store.credentials[envVar];
  const next: CredentialMetadata = {
    env_var: envVar,
    saved_at: existing?.saved_at ?? now,
    updated_at: now,
  };
  store.credentials[envVar] = { saved_at: next.saved_at, updated_at: next.updated_at };
  await writeFile(await metadataPath(), `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  return next;
}

async function readFromService(envVar: string, service: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password',
      '-a',
      envVar,
      '-s',
      service,
      '-w',
    ]);
    const value = stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

async function deleteFromService(envVar: string, service: string): Promise<void> {
  try {
    await execFileAsync('security', [
      'delete-generic-password',
      '-a',
      envVar,
      '-s',
      service,
    ]);
  } catch {
    // idempotent
  }
}

async function writeToService(envVar: string, value: string, service: string): Promise<void> {
  await execFileAsync('security', [
    'add-generic-password',
    '-a',
    envVar,
    '-s',
    service,
    '-w',
    value,
    '-U',
  ]);
}

async function readWithLegacyMigration(envVar: string): Promise<string | null> {
  const primary = await primaryKeychainService();
  const value = await readFromService(envVar, primary);
  if (value) {
    return value;
  }

  if (primary === LEGACY_KEYCHAIN_SERVICE) {
    return null;
  }

  const legacyValue = await readFromService(envVar, LEGACY_KEYCHAIN_SERVICE);
  if (!legacyValue) {
    return null;
  }

  await writeToService(envVar, legacyValue, primary);
  await deleteFromService(envVar, LEGACY_KEYCHAIN_SERVICE);
  return legacyValue;
}

export async function desktopKeychainGet(envVar: string): Promise<string | null> {
  return readWithLegacyMigration(envVar);
}

export async function desktopKeychainDelete(envVar: string): Promise<void> {
  const primary = await primaryKeychainService();
  for (const service of keychainServiceCandidates(primary)) {
    await deleteFromService(envVar, service);
  }
}

export async function desktopKeychainHas(envVar: string): Promise<boolean> {
  const value = await readWithLegacyMigration(envVar);
  return value !== null;
}

export async function desktopKeychainSet(envVar: string, value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('value must not be empty');
  }
  const primary = await primaryKeychainService();
  await writeToService(envVar, trimmed, primary);

  if (primary !== LEGACY_KEYCHAIN_SERVICE) {
    await deleteFromService(envVar, LEGACY_KEYCHAIN_SERVICE);
  }
}
