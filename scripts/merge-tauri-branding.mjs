#!/usr/bin/env node
/**
 * Merge ui.config.yaml branding into src-tauri/tauri.conf.json (ADR-048).
 *
 * Resolution order for project root:
 * 1) --project-root flag
 * 2) CONTROL_PLANE_PROJECT_ROOT env
 * 3) ../business-workflow/app relative to harness-control-plane root
 *
 * Patches: productName, identifier, app.windows[0].title
 * Sources: distribution.desktop.* with presentation.title fallbacks
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';

const harnessRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultTauriPath = join(harnessRoot, 'src-tauri', 'tauri.conf.json');

function parseArgs(argv) {
  let projectRoot = null;
  let tauriPath = defaultTauriPath;
  let stdout = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project-root' && argv[index + 1]) {
      projectRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--tauri-conf' && argv[index + 1]) {
      tauriPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--stdout') {
      stdout = true;
    }
  }

  return { projectRoot, tauriPath, stdout };
}

function resolveProjectRoot(explicitRoot) {
  const fromFlagOrEnv =
    explicitRoot?.trim() || process.env.CONTROL_PLANE_PROJECT_ROOT?.trim();
  if (fromFlagOrEnv) {
    return resolve(fromFlagOrEnv);
  }
  return resolve(harnessRoot, '..', 'business-workflow', 'app');
}

function readUiConfig(projectRoot) {
  const configPath = join(projectRoot, 'ui.config.yaml');
  if (!existsSync(configPath)) {
    throw new Error(`ui.config.yaml not found at ${configPath}`);
  }
  const raw = parseYaml(readFileSync(configPath, 'utf8'));
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('ui.config.yaml root must be an object');
  }
  return raw;
}

function resolveBranding(uiConfig, existingTauri) {
  const presentation = uiConfig.presentation ?? {};
  const desktop = uiConfig.distribution?.desktop ?? {};
  const metadata = uiConfig.metadata ?? {};

  const windowTitle =
    (typeof desktop.window_title === 'string' && desktop.window_title.trim()) ||
    (typeof presentation.title === 'string' && presentation.title.trim()) ||
    existingTauri.productName;

  const identifier =
    (typeof desktop.identifier === 'string' && desktop.identifier.trim()) ||
    (typeof metadata.product_id === 'string' && metadata.product_id.trim()
      ? `ai.jambu.${metadata.product_id.trim()}`
      : null) ||
    existingTauri.identifier;

  return {
    productName: windowTitle,
    identifier,
    windowTitle,
  };
}

function mergeTauriConfig(tauri, branding) {
  const merged = structuredClone(tauri);
  merged.productName = branding.productName;
  merged.identifier = branding.identifier;

  if (!Array.isArray(merged.app?.windows) || merged.app.windows.length === 0) {
    throw new Error('tauri.conf.json must define app.windows[0]');
  }

  merged.app.windows[0].title = branding.windowTitle;
  return merged;
}

function main() {
  const { projectRoot: explicitRoot, tauriPath, stdout } = parseArgs(process.argv.slice(2));
  const projectRoot = resolveProjectRoot(explicitRoot);

  const uiConfig = readUiConfig(projectRoot);
  const tauri = JSON.parse(readFileSync(tauriPath, 'utf8'));
  const branding = resolveBranding(uiConfig, tauri);
  const merged = mergeTauriConfig(tauri, branding);

  if (stdout) {
    process.stdout.write(`${JSON.stringify(merged, null, 2)}\n`);
    return;
  }

  writeFileSync(tauriPath, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(
    `[merge-tauri-branding] projectRoot=${projectRoot} identifier=${branding.identifier} title=${branding.windowTitle}`,
  );
}

main();
