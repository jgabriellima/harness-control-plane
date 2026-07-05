import type { UIConfig } from './ui-config';

export type VoiceInputEngine = 'browser' | 'media';

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

function resolveEngine(raw: unknown): VoiceInputEngine {
  if (raw === 'media') {
    return 'media';
  }
  return 'browser';
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
export function resolveVoiceInputConfig(uiConfig: UIConfig): VoiceInputConfig {
  const featureFlag = uiConfig.features?.voice_input;
  const composer = uiConfig.composer?.voice_input;

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
    engine: resolveEngine(composer?.engine),
  };
}
