import { r as resolveRuntimeSurface } from './runtime-surface_DYjhsAWH.mjs';

const DEFAULT_VOICE_INPUT_CONFIG = {
  enabled: true,
  keyboardShortcut: "Mod+Shift+V",
  language: "en-US",
  autoSubmit: false,
  engine: "browser"
};
function resolveLanguage(uiConfig, override) {
  const trimmed = override?.trim();
  if (trimmed) {
    return trimmed;
  }
  return uiConfig.presentation?.locale?.trim() || DEFAULT_VOICE_INPUT_CONFIG.language;
}
function resolveEngine(raw) {
  if (raw === "media") {
    return "media";
  }
  if (raw === "browser") {
    return "browser";
  }
  return null;
}
function defaultEngineForSurface(surface) {
  return surface === "desktop" || surface === "embedded" ? "media" : "browser";
}
function resolveVoiceInputConfig(uiConfig, options = {}) {
  const featureFlag = uiConfig.features?.voice_input;
  const composer = uiConfig.composer?.voice_input;
  const surface = resolveRuntimeSurface({
    distributionSurface: uiConfig.distribution?.surface,
    desktopRuntime: options.desktopRuntime
  });
  const explicitEngine = resolveEngine(composer?.engine);
  const enabled = featureFlag === false ? false : composer?.enabled !== void 0 ? composer.enabled : featureFlag ?? DEFAULT_VOICE_INPUT_CONFIG.enabled;
  return {
    enabled,
    keyboardShortcut: composer?.keyboard_shortcut?.trim() || DEFAULT_VOICE_INPUT_CONFIG.keyboardShortcut,
    language: resolveLanguage(uiConfig, composer?.language),
    autoSubmit: composer?.auto_submit ?? DEFAULT_VOICE_INPUT_CONFIG.autoSubmit,
    engine: explicitEngine ?? defaultEngineForSurface(surface)
  };
}

export { DEFAULT_VOICE_INPUT_CONFIG as D, resolveVoiceInputConfig as r };
