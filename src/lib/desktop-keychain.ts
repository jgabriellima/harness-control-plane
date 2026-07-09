import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CredentialMetadata {
  env_var: string;
  saved_at: string;
  updated_at: string;
}

interface MetadataStore {
  credentials: Record<string, { saved_at: string; updated_at: string }>;
}

function keychainService(): string {
  return (
    process.env.JAMBU_HOST_BUNDLE_ID?.trim() ||
    process.env.TAURI_BUNDLE_IDENTIFIER?.trim() ||
    'ai.jambu.business-runtime'
  );
}

function metadataDir(): string {
  const appData = process.env.TAURI_APP_DATA_DIR?.trim();
  if (appData) {
    return appData;
  }
  const bundleId = keychainService();
  const home = process.env.HOME?.trim();
  if (!home) {
    throw new Error('Cannot resolve credential metadata directory');
  }
  return join(home, 'Library', 'Application Support', bundleId);
}

function metadataPath(): string {
  return join(metadataDir(), 'credential-metadata.json');
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
    const raw = await readFile(metadataPath(), 'utf8');
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
  const dir = metadataDir();
  await mkdir(dir, { recursive: true });
  const store = await readMetadataStore();
  const existing = store.credentials[envVar];
  const next: CredentialMetadata = {
    env_var: envVar,
    saved_at: existing?.saved_at ?? now,
    updated_at: now,
  };
  store.credentials[envVar] = { saved_at: next.saved_at, updated_at: next.updated_at };
  await writeFile(metadataPath(), `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  return next;
}

export async function desktopKeychainHas(envVar: string): Promise<boolean> {
  const service = keychainService();
  try {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password',
      '-a',
      envVar,
      '-s',
      service,
      '-w',
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function desktopKeychainSet(envVar: string, value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('value must not be empty');
  }
  const service = keychainService();
  await execFileAsync('security', [
    'add-generic-password',
    '-a',
    envVar,
    '-s',
    service,
    '-w',
    trimmed,
    '-U',
  ]);
}
