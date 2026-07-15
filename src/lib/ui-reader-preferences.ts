import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { resolveWorkspaceHarnessBinding } from './workspace-harness-binding';
import {
  DEFAULT_READER_PREFERENCES,
  type ReaderPreferences,
  normalizeReaderPreferences,
} from './reader-preferences';

async function readerPreferencesPath(workspaceRoot?: string): Promise<string> {
  const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
  const uiDir = join(binding.harnessRoot, 'ui');
  return join(uiDir, 'reader-preferences.yaml');
}

export async function readReaderPreferences(workspaceRoot?: string): Promise<ReaderPreferences> {
  const manifestPath = await readerPreferencesPath(workspaceRoot);
  try {
    const raw = await readFile(manifestPath, 'utf8');
    return normalizeReaderPreferences(parseYaml(raw));
  } catch {
    return DEFAULT_READER_PREFERENCES;
  }
}

export async function writeReaderPreferences(
  preferences: ReaderPreferences,
  workspaceRoot?: string,
): Promise<ReaderPreferences> {
  const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
  const uiDir = join(binding.harnessRoot, 'ui');
  await mkdir(uiDir, { recursive: true });
  const normalized = normalizeReaderPreferences(preferences);
  const manifestPath = join(uiDir, 'reader-preferences.yaml');
  await writeFile(manifestPath, stringifyYaml(normalized), 'utf8');
  return normalized;
}

export async function patchReaderPreferences(
  patch: Partial<ReaderPreferences>,
  workspaceRoot?: string,
): Promise<ReaderPreferences> {
  const current = await readReaderPreferences(workspaceRoot);
  return writeReaderPreferences({
    ...current,
    ...patch,
  }, workspaceRoot);
}
