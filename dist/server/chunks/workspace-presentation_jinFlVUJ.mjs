import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { D as DEFAULT_PRESENTATION_CONFIG, i as isRichUiMode } from './presentation-types_CtohLCX-.mjs';

const DEFAULT_WORKSPACE_PRESENTATION = {
  version: 1,
  richUi: DEFAULT_PRESENTATION_CONFIG.richUi
};
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function normalizeManifest(raw) {
  if (!isRecord(raw)) {
    return DEFAULT_WORKSPACE_PRESENTATION;
  }
  const richUi = isRichUiMode(raw.richUi) ? raw.richUi : DEFAULT_WORKSPACE_PRESENTATION.richUi;
  return {
    version: typeof raw.version === "number" ? raw.version : 1,
    richUi
  };
}
function presentationManifestPath(workspaceRoot) {
  return join(workspaceRoot, ".business", "state", "presentation.yaml");
}
async function readWorkspacePresentation(workspaceRoot) {
  const manifestPath = presentationManifestPath(workspaceRoot);
  try {
    const raw = await readFile(manifestPath, "utf8");
    return normalizeManifest(parse(raw));
  } catch {
    return DEFAULT_WORKSPACE_PRESENTATION;
  }
}
async function writeWorkspacePresentation(workspaceRoot, manifest) {
  const manifestPath = presentationManifestPath(workspaceRoot);
  const stateDir = join(workspaceRoot, ".business", "state");
  await mkdir(stateDir, { recursive: true });
  const normalized = normalizeManifest(manifest);
  await writeFile(manifestPath, stringify(normalized), "utf8");
  return normalized;
}
async function patchWorkspacePresentation(workspaceRoot, patch) {
  const current = await readWorkspacePresentation(workspaceRoot);
  return writeWorkspacePresentation(workspaceRoot, {
    ...current,
    ...patch
  });
}
function toPresentationConfig(manifest) {
  return { richUi: manifest.richUi };
}

export { patchWorkspacePresentation as p, readWorkspacePresentation as r, toPresentationConfig as t };
