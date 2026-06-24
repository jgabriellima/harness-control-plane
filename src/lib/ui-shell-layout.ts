import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { resolveHarnessBinding } from './harness-binding';
import {
  SHELL_LAYOUT_DEFAULTS,
  SHELL_LAYOUT_MIN,
  clampPanelSize,
} from './shell-layout';

export interface ShellLayoutManifest {
  version: number;
  sidebarSize: number;
  contextSize: number;
  sidebarExpanded: boolean;
}

export const DEFAULT_SHELL_LAYOUT: ShellLayoutManifest = {
  version: 1,
  sidebarSize: SHELL_LAYOUT_DEFAULTS.sidebar,
  contextSize: SHELL_LAYOUT_DEFAULTS.context,
  sidebarExpanded: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeManifest(raw: unknown): ShellLayoutManifest {
  if (!isRecord(raw)) {
    return DEFAULT_SHELL_LAYOUT;
  }

  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    sidebarSize: clampPanelSize(
      typeof raw.sidebarSize === 'number' ? raw.sidebarSize : NaN,
      DEFAULT_SHELL_LAYOUT.sidebarSize,
      SHELL_LAYOUT_MIN.sidebar,
    ),
    contextSize: clampPanelSize(
      typeof raw.contextSize === 'number' ? raw.contextSize : NaN,
      DEFAULT_SHELL_LAYOUT.contextSize,
      SHELL_LAYOUT_MIN.context,
    ),
    sidebarExpanded: typeof raw.sidebarExpanded === 'boolean' ? raw.sidebarExpanded : false,
  };
}

async function layoutPaths() {
  const binding = await resolveHarnessBinding();
  const uiDir = join(binding.harnessRoot, 'ui');
  return {
    uiDir,
    manifestPath: join(uiDir, 'shell-layout.yaml'),
  };
}

export async function readShellLayoutManifest(): Promise<ShellLayoutManifest> {
  const paths = await layoutPaths();
  try {
    const raw = await readFile(paths.manifestPath, 'utf8');
    const normalized = normalizeManifest(parseYaml(raw));
    if (
      normalized.sidebarSize < SHELL_LAYOUT_MIN.sidebar ||
      normalized.contextSize < SHELL_LAYOUT_MIN.context
    ) {
      return writeShellLayoutManifest(DEFAULT_SHELL_LAYOUT);
    }
    return normalized;
  } catch {
    await writeShellLayoutManifest(DEFAULT_SHELL_LAYOUT);
    return DEFAULT_SHELL_LAYOUT;
  }
}

export async function writeShellLayoutManifest(
  manifest: ShellLayoutManifest,
): Promise<ShellLayoutManifest> {
  const paths = await layoutPaths();
  await mkdir(paths.uiDir, { recursive: true });
  const normalized = normalizeManifest(manifest);
  await writeFile(paths.manifestPath, stringifyYaml(normalized), 'utf8');
  return normalized;
}

export async function patchShellLayoutManifest(
  patch: Partial<ShellLayoutManifest>,
): Promise<ShellLayoutManifest> {
  const current = await readShellLayoutManifest();
  return writeShellLayoutManifest({
    ...current,
    ...patch,
  });
}
