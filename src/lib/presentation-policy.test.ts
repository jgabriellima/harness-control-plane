import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parsePresentationDefaultFromUiConfig,
  resolvePresentation,
  stripPresentationPrefixes,
} from './presentation-policy.ts';
import type { UIConfig } from './ui-config.ts';

describe('resolvePresentation', () => {
  it('uses workspace adaptive default without slash commands', () => {
    const resolved = resolvePresentation(
      {
        project_id: 'default',
        message: 'Summarize workspace activity with two metrics and a chart.',
      },
      { richUi: 'adaptive' },
      'adaptive',
    );

    assert.equal(resolved.richUi, 'adaptive');
    assert.equal(resolved.wireMode, 'rich');
    assert.equal(resolved.promptVariant, 'adaptive');
  });

  it('forces plain text for /text override', () => {
    const resolved = resolvePresentation(
      {
        project_id: 'default',
        message: '/text Just answer in one sentence.',
      },
      { richUi: 'always' },
      'adaptive',
    );

    assert.equal(resolved.richUi, 'off');
    assert.equal(resolved.wireMode, 'text');
    assert.equal(resolved.promptVariant, 'none');
    assert.equal(stripPresentationPrefixes('/text Just answer in one sentence.'), 'Just answer in one sentence.');
  });

  it('forces rich output for /openui override', () => {
    const resolved = resolvePresentation(
      {
        project_id: 'default',
        message: '/openui Show metrics',
      },
      { richUi: 'off' },
      'off',
    );

    assert.equal(resolved.richUi, 'always');
    assert.equal(resolved.promptVariant, 'full');
  });

  it('reads DSL default from ui.config composer.presentation', () => {
    const uiConfig = {
      apiVersion: 'proc.jambu/v1',
      kind: 'ControlPlaneUI',
      composer: {
        presentation: {
          rich_ui: 'always',
        },
      },
    } as UIConfig;

    assert.equal(parsePresentationDefaultFromUiConfig(uiConfig), 'always');
  });
});
