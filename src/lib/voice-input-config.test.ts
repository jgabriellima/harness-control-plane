import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatKeyboardShortcut,
  matchesKeyboardShortcut,
  parseKeyboardShortcut,
} from './keyboard-shortcut.ts';
import { resolveVoiceInputConfig } from './voice-input-config.ts';
import type { UIConfig } from './ui-config.ts';

describe('parseKeyboardShortcut', () => {
  it('parses Mod+Shift+V', () => {
    const parsed = parseKeyboardShortcut('Mod+Shift+V');
    assert.deepEqual(parsed, {
      mod: true,
      shift: true,
      alt: false,
      ctrl: false,
      key: 'v',
    });
  });

  it('returns null for invalid tokens', () => {
    assert.equal(parseKeyboardShortcut('Foo+Bar'), null);
  });
});

describe('matchesKeyboardShortcut', () => {
  it('matches Alt+V without mod keys', () => {
    const parsed = parseKeyboardShortcut('Alt+V');
    assert.ok(parsed);
    const event = {
      key: 'v',
      shiftKey: false,
      altKey: true,
      ctrlKey: false,
      metaKey: false,
    } as KeyboardEvent;
    assert.equal(matchesKeyboardShortcut(event, parsed), true);
  });
});

describe('formatKeyboardShortcut', () => {
  it('returns a non-empty label', () => {
    assert.match(formatKeyboardShortcut('Mod+Shift+V'), /V/);
  });
});

describe('resolveVoiceInputConfig', () => {
  const baseConfig: UIConfig = {
    apiVersion: 'proc.jambu/v1',
    kind: 'ControlPlaneUI',
    presentation: { locale: 'pt-BR' },
  };

  it('defaults to enabled with locale language', () => {
    const resolved = resolveVoiceInputConfig(baseConfig);
    assert.equal(resolved.enabled, true);
    assert.equal(resolved.language, 'pt-BR');
    assert.equal(resolved.keyboardShortcut, 'Mod+Shift+V');
    assert.equal(resolved.engine, 'browser');
  });

  it('honors composer.voice_input overrides', () => {
    const resolved = resolveVoiceInputConfig({
      ...baseConfig,
      composer: {
        voice_input: {
          enabled: true,
          keyboard_shortcut: 'Alt+V',
          language: 'en-US',
          auto_submit: true,
          engine: 'media',
        },
      },
    });
    assert.equal(resolved.keyboardShortcut, 'Alt+V');
    assert.equal(resolved.language, 'en-US');
    assert.equal(resolved.autoSubmit, true);
    assert.equal(resolved.engine, 'media');
  });

  it('disables when features.voice_input is false', () => {
    const resolved = resolveVoiceInputConfig({
      ...baseConfig,
      features: { voice_input: false },
    });
    assert.equal(resolved.enabled, false);
  });
});
