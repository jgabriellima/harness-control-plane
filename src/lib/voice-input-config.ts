import type { UIConfig } from './ui-config';
import { resolveRuntimeSurface, type RuntimeSurface } from './runtime-surface';

export type VoiceInputEngine = 'browser' | 'media';

export interface ResolveVoiceInputConfigOptions {
  runtimeSurface?: RuntimeSurface;
  desktopRuntime?: boolean;
}

export interface VoiceInputConfig {
  enabled: boolean;
  keyboardShortcut: string;
  language: string;
  autoSubmit: boolean;
  engine: VoiceInputEngine;
}

export const DEFAULT_VOICE_INPUT_CONFIG: VoiceInputConfig = {
  enabled: true,
  keyboardShortcut: 'Mod+Shift+V',
  language: 'en-US',
  autoSubmit: false,
  engine: 'browser',
};

function resolveLanguage(uiConfig: UIConfig, override?: string): string {
  const trimmed = override?.trim();
  if (trimmed) {
    return trimmed;
  }
  return uiConfig.presentation?.locale?.trim() || DEFAULT_VOICE_INPUT_CONFIG.language;
}

function resolveEngine(raw: unknown): VoiceInputEngine | null {
  if (raw === 'media') {
    return 'media';
  }
  if (raw === 'browser') {
    return 'browser';
  }
  return null;
}

function defaultEngineForSurface(surface: RuntimeSurface): VoiceInputEngine {
  // Desktop/Tauri: capture audio locally and transcribe via sidecar (faster-whisper).
  // Web Speech API is unreliable inside WKWebView/WebView2.
  return surface === 'desktop' || surface === 'embedded' ? 'media' : 'browser';
}

/**
 * Resolve composer voice-input settings from ui.config.yaml.
 *
 * YAML shape:
 * ```yaml
 * composer:
 *   voice_input:
 *     enabled: true
 *     keyboard_shortcut: Mod+Shift+V
 *     language: en-US
 *     auto_submit: false
 *     engine: browser  # browser | media
 * ```
 */
export function resolveVoiceInputConfig(
  uiConfig: UIConfig,
  options: ResolveVoiceInputConfigOptions = {},
): VoiceInputConfig {
  const featureFlag = uiConfig.features?.voice_input;
  const composer = uiConfig.composer?.voice_input;
  const surface = resolveRuntimeSurface({
    distributionSurface: uiConfig.distribution?.surface,
    desktopRuntime: options.desktopRuntime,
  });
  const explicitEngine = resolveEngine(composer?.engine);

  const enabled =
    featureFlag === false
      ? false
      : composer?.enabled !== undefined
        ? composer.enabled
        : featureFlag ?? DEFAULT_VOICE_INPUT_CONFIG.enabled;

  return {
    enabled,
    keyboardShortcut:
      composer?.keyboard_shortcut?.trim() || DEFAULT_VOICE_INPUT_CONFIG.keyboardShortcut,
    language: resolveLanguage(uiConfig, composer?.language),
    autoSubmit: composer?.auto_submit ?? DEFAULT_VOICE_INPUT_CONFIG.autoSubmit,
    engine: explicitEngine ?? defaultEngineForSurface(surface),
  };
}
