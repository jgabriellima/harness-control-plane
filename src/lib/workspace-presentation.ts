import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import {
  DEFAULT_PRESENTATION_CONFIG,
  type PresentationConfig,
  type RichUiMode,
  isRichUiMode,
} from './presentation-types';

export interface WorkspacePresentationManifest {
  version: number;
  richUi: RichUiMode;
}

export const DEFAULT_WORKSPACE_PRESENTATION: WorkspacePresentationManifest = {
  version: 1,
  richUi: DEFAULT_PRESENTATION_CONFIG.richUi,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeManifest(raw: unknown): WorkspacePresentationManifest {
  if (!isRecord(raw)) {
    return DEFAULT_WORKSPACE_PRESENTATION;
  }

  const richUi = isRichUiMode(raw.richUi) ? raw.richUi : DEFAULT_WORKSPACE_PRESENTATION.richUi;

  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    richUi,
  };
}

function presentationManifestPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.business', 'state', 'presentation.yaml');
}

export async function readWorkspacePresentation(
  workspaceRoot: string,
): Promise<WorkspacePresentationManifest> {
  const manifestPath = presentationManifestPath(workspaceRoot);
  try {
    const raw = await readFile(manifestPath, 'utf8');
    return normalizeManifest(parseYaml(raw));
  } catch {
    return DEFAULT_WORKSPACE_PRESENTATION;
  }
}

export async function writeWorkspacePresentation(
  workspaceRoot: string,
  manifest: WorkspacePresentationManifest,
): Promise<WorkspacePresentationManifest> {
  const manifestPath = presentationManifestPath(workspaceRoot);
  const stateDir = join(workspaceRoot, '.business', 'state');
  await mkdir(stateDir, { recursive: true });
  const normalized = normalizeManifest(manifest);
  await writeFile(manifestPath, stringifyYaml(normalized), 'utf8');
  return normalized;
}

export async function patchWorkspacePresentation(
  workspaceRoot: string,
  patch: Partial<WorkspacePresentationManifest>,
): Promise<WorkspacePresentationManifest> {
  const current = await readWorkspacePresentation(workspaceRoot);
  return writeWorkspacePresentation(workspaceRoot, {
    ...current,
    ...patch,
  });
}

export function toPresentationConfig(manifest: WorkspacePresentationManifest): PresentationConfig {
  return { richUi: manifest.richUi };
}
