import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { resolveHarnessBinding } from './harness-binding';
import {
  type ComputerUsePreferences,
  type ComputerUseStatus,
  defaultComputerUsePreferences,
} from './runtime-computer-use-types';
import { probeComputerUseHealth } from './runtime-computer-use-bridge';
import { probeComputerUseSetup } from './runtime-computer-use-setup';

const PREFERENCES_REL = 'state/computer-use-preferences.json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function isComputerUseContractEnabled(workspaceRoot?: string): Promise<boolean> {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});

  try {
    const raw = await readFile(binding.dslPath, 'utf8');
    const parsed = parseYaml(raw);
    if (!isRecord(parsed)) {
      return false;
    }
    const runtime = parsed.runtime;
    if (!isRecord(runtime)) {
      return false;
    }
    const computerUse = runtime.computer_use;
    if (!isRecord(computerUse)) {
      return false;
    }
    return computerUse.enabled === true;
  } catch {
    return false;
  }
}

function parsePreferences(raw: unknown): ComputerUsePreferences {
  const defaults = defaultComputerUsePreferences();
  if (!isRecord(raw)) {
    return defaults;
  }

  return {
    hostControlEnabled: raw.hostControlEnabled === true,
    allowForegroundCursor: raw.allowForegroundCursor === true,
    consentedAt: typeof raw.consentedAt === 'string' ? raw.consentedAt : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : defaults.updatedAt,
  };
}

async function preferencesPath(workspaceRoot?: string): Promise<string> {
  const binding = await resolveHarnessBinding(workspaceRoot ? { workspaceRoot } : {});
  const stateDir = join(binding.harnessRoot, 'state');
  await mkdir(stateDir, { recursive: true });
  return join(stateDir, 'computer-use-preferences.json');
}

export async function loadComputerUsePreferences(workspaceRoot?: string): Promise<ComputerUsePreferences> {
  const path = await preferencesPath(workspaceRoot);

  try {
    const raw = await readFile(path, 'utf8');
    return parsePreferences(JSON.parse(raw) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultComputerUsePreferences();
    }
    throw error;
  }
}

export interface ComputerUsePreferencesPatch {
  hostControlEnabled?: boolean;
  allowForegroundCursor?: boolean;
}

export async function saveComputerUsePreferences(
  patch: ComputerUsePreferencesPatch,
  workspaceRoot?: string,
): Promise<ComputerUsePreferences> {
  const path = await preferencesPath(workspaceRoot);
  const current = await loadComputerUsePreferences(workspaceRoot);
  const now = new Date().toISOString();

  const hostControlEnabled = patch.hostControlEnabled ?? current.hostControlEnabled;
  const allowForegroundCursor = patch.allowForegroundCursor ?? current.allowForegroundCursor;

  const next: ComputerUsePreferences = {
    hostControlEnabled,
    allowForegroundCursor: hostControlEnabled ? allowForegroundCursor : false,
    consentedAt: hostControlEnabled ? current.consentedAt ?? now : null,
    updatedAt: now,
  };

  if (patch.hostControlEnabled === true && !current.consentedAt) {
    next.consentedAt = now;
  }

  if (patch.hostControlEnabled === false) {
    next.consentedAt = null;
    next.allowForegroundCursor = false;
  }

  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export async function loadComputerUseStatus(workspaceRoot?: string): Promise<ComputerUseStatus> {
  const preferences = await loadComputerUsePreferences(workspaceRoot);
  const path = await preferencesPath(workspaceRoot);
  const setup = await probeComputerUseSetup(workspaceRoot);
  const driverOnPath = setup.driverInstalled;

  try {
    await access(path);
  } catch {
    // Preferences file may not exist yet — defaults apply.
  }

  const active = preferences.hostControlEnabled && setup.ready;
  const health = active ? await probeComputerUseHealth() : null;

  return {
    preferences,
    driverOnPath,
    preferencesPath: path,
    setup,
    active,
    health,
  };
}
