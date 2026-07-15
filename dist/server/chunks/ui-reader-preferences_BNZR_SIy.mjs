import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { r as resolveWorkspaceHarnessBinding } from './workspace-harness-binding_DtkiVVW4.mjs';
import { n as normalizeReaderPreferences, D as DEFAULT_READER_PREFERENCES } from './reader-preferences_nY-iUW51.mjs';

async function readerPreferencesPath(workspaceRoot) {
  const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
  const uiDir = join(binding.harnessRoot, "ui");
  return join(uiDir, "reader-preferences.yaml");
}
async function readReaderPreferences(workspaceRoot) {
  const manifestPath = await readerPreferencesPath(workspaceRoot);
  try {
    const raw = await readFile(manifestPath, "utf8");
    return normalizeReaderPreferences(parse(raw));
  } catch {
    return DEFAULT_READER_PREFERENCES;
  }
}
async function writeReaderPreferences(preferences, workspaceRoot) {
  const binding = await resolveWorkspaceHarnessBinding({ workspaceRoot });
  const uiDir = join(binding.harnessRoot, "ui");
  await mkdir(uiDir, { recursive: true });
  const normalized = normalizeReaderPreferences(preferences);
  const manifestPath = join(uiDir, "reader-preferences.yaml");
  await writeFile(manifestPath, stringify(normalized), "utf8");
  return normalized;
}
async function patchReaderPreferences(patch, workspaceRoot) {
  const current = await readReaderPreferences(workspaceRoot);
  return writeReaderPreferences({
    ...current,
    ...patch
  }, workspaceRoot);
}

export { patchReaderPreferences as p, readReaderPreferences as r };
