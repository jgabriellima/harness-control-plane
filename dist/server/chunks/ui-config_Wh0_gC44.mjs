import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

const UI_CONFIG_FILENAME = "ui.config.yaml";
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function assertOptionalString(value, path) {
  if (value === void 0) {
    return;
  }
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string`);
  }
}
function assertOptionalStringArray(value, path) {
  if (value === void 0) {
    return;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${path} must be an array of strings`);
  }
}
function assertOptionalRecord(value, path) {
  if (value === void 0) {
    return;
  }
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
}
function parseAndValidateUIConfig(raw) {
  if (!isRecord(raw)) {
    throw new Error("ui.config.yaml root must be an object");
  }
  if (raw.apiVersion !== "proc.jambu/v1") {
    throw new Error("ui.config.yaml apiVersion must be proc.jambu/v1");
  }
  if (raw.kind !== "ControlPlaneUI") {
    throw new Error("ui.config.yaml kind must be ControlPlaneUI");
  }
  assertOptionalRecord(raw.metadata, "metadata");
  if (raw.metadata) {
    assertOptionalString(raw.metadata.name, "metadata.name");
    assertOptionalString(raw.metadata.product_id, "metadata.product_id");
  }
  assertOptionalRecord(raw.presentation, "presentation");
  if (raw.presentation) {
    assertOptionalString(raw.presentation.title, "presentation.title");
    assertOptionalString(raw.presentation.locale, "presentation.locale");
    assertOptionalString(raw.presentation.theme_pack, "presentation.theme_pack");
    if (raw.presentation.theme !== void 0 && raw.presentation.theme !== "system" && raw.presentation.theme !== "light" && raw.presentation.theme !== "dark") {
      throw new Error("presentation.theme must be one of: system, light, dark");
    }
    assertOptionalRecord(raw.presentation.assets, "presentation.assets");
    if (raw.presentation.assets) {
      assertOptionalString(raw.presentation.assets.icon_light, "presentation.assets.icon_light");
      assertOptionalString(raw.presentation.assets.icon_dark, "presentation.assets.icon_dark");
      assertOptionalString(raw.presentation.assets.wordmark_light, "presentation.assets.wordmark_light");
      assertOptionalString(raw.presentation.assets.wordmark_dark, "presentation.assets.wordmark_dark");
    }
  }
  assertOptionalRecord(raw.features, "features");
  if (raw.features) {
    for (const [featureName, enabled] of Object.entries(raw.features)) {
      if (typeof enabled !== "boolean") {
        throw new Error(`features.${featureName} must be a boolean`);
      }
    }
  }
  assertOptionalRecord(raw.panels, "panels");
  if (raw.panels) {
    assertOptionalString(raw.panels.default_layout, "panels.default_layout");
    assertOptionalStringArray(raw.panels.enabled, "panels.enabled");
  }
  assertOptionalRecord(raw.distribution, "distribution");
  if (raw.distribution) {
    if (raw.distribution.surface !== void 0 && raw.distribution.surface !== "web" && raw.distribution.surface !== "desktop" && raw.distribution.surface !== "embedded") {
      throw new Error("distribution.surface must be one of: web, desktop, embedded");
    }
    assertOptionalRecord(raw.distribution.desktop, "distribution.desktop");
    if (raw.distribution.desktop) {
      assertOptionalString(raw.distribution.desktop.identifier, "distribution.desktop.identifier");
      assertOptionalString(raw.distribution.desktop.window_title, "distribution.desktop.window_title");
    }
  }
  assertOptionalRecord(raw.integrator, "integrator");
  if (raw.integrator) {
    assertOptionalString(raw.integrator.project_root, "integrator.project_root");
    assertOptionalString(raw.integrator.hooks_module, "integrator.hooks_module");
    assertOptionalString(raw.integrator.policy_profile, "integrator.policy_profile");
  }
  assertOptionalRecord(raw.composer, "composer");
  if (raw.composer) {
    assertOptionalRecord(raw.composer.voice_input, "composer.voice_input");
    if (raw.composer.voice_input) {
      const voiceInput = raw.composer.voice_input;
      if (voiceInput.enabled !== void 0 && typeof voiceInput.enabled !== "boolean") {
        throw new Error("composer.voice_input.enabled must be a boolean");
      }
      assertOptionalString(voiceInput.keyboard_shortcut, "composer.voice_input.keyboard_shortcut");
      assertOptionalString(voiceInput.language, "composer.voice_input.language");
      if (voiceInput.auto_submit !== void 0 && typeof voiceInput.auto_submit !== "boolean") {
        throw new Error("composer.voice_input.auto_submit must be a boolean");
      }
      if (voiceInput.engine !== void 0 && voiceInput.engine !== "browser" && voiceInput.engine !== "media") {
        throw new Error("composer.voice_input.engine must be one of: browser, media");
      }
    }
    assertOptionalRecord(raw.composer.presentation, "composer.presentation");
    if (raw.composer.presentation) {
      const richUi = raw.composer.presentation.rich_ui;
      if (richUi !== void 0 && richUi !== "off" && richUi !== "adaptive" && richUi !== "always") {
        throw new Error("composer.presentation.rich_ui must be one of: off, adaptive, always");
      }
    }
  }
  return raw;
}
function uiConfigPath(projectRoot) {
  return join(projectRoot, UI_CONFIG_FILENAME);
}
async function loadUIConfig(projectRoot) {
  const configPath = uiConfigPath(projectRoot);
  const raw = await readFile(configPath, "utf8");
  const parsed = parse(raw);
  return parseAndValidateUIConfig(parsed);
}

export { loadUIConfig as l };
