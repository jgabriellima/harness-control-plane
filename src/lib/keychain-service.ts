import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { resolveProjectRoot } from './project-root';

/** Pre-ADR-048 dev default; credentials may still exist here until migrated. */
export const LEGACY_KEYCHAIN_SERVICE = 'ai.jambu.business-runtime';

let cachedBundleId: string | null | undefined;

function bundleIdFromEnv(): string | undefined {
  return (
    process.env.JAMBU_HOST_BUNDLE_ID?.trim() ||
    process.env.TAURI_BUNDLE_IDENTIFIER?.trim() ||
    undefined
  );
}

async function bundleIdFromUiConfig(): Promise<string | undefined> {
  try {
    const projectRoot = resolveProjectRoot();
    const raw = await readFile(join(projectRoot, 'ui.config.yaml'), 'utf8');
    const doc = parseYaml(raw) as {
      distribution?: { desktop?: { identifier?: string } };
    };
    const identifier = doc.distribution?.desktop?.identifier?.trim();
    return identifier || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the macOS keychain service name (Tauri bundle identifier).
 * Priority: env override → ui.config distribution.desktop.identifier → legacy dev default.
 */
export async function resolveKeychainService(): Promise<string> {
  const fromEnv = bundleIdFromEnv();
  if (fromEnv) {
    return fromEnv;
  }

  if (cachedBundleId !== undefined) {
    return cachedBundleId ?? LEGACY_KEYCHAIN_SERVICE;
  }

  const fromConfig = await bundleIdFromUiConfig();
  cachedBundleId = fromConfig ?? null;
  return fromConfig ?? LEGACY_KEYCHAIN_SERVICE;
}

/** Synchronous resolver — only env + cache; use resolveKeychainService() when cache is cold. */
export function resolveKeychainServiceSync(): string {
  const fromEnv = bundleIdFromEnv();
  if (fromEnv) {
    return fromEnv;
  }
  if (cachedBundleId) {
    return cachedBundleId;
  }
  return LEGACY_KEYCHAIN_SERVICE;
}

export function primeKeychainServiceCache(bundleId: string): void {
  const trimmed = bundleId.trim();
  if (trimmed) {
    cachedBundleId = trimmed;
  }
}

export function keychainServiceCandidates(primary: string): string[] {
  const ordered = [primary];
  if (primary !== LEGACY_KEYCHAIN_SERVICE) {
    ordered.push(LEGACY_KEYCHAIN_SERVICE);
  }
  return ordered;
}
