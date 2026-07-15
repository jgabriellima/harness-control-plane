import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdaptiveOpenUIPromptSection,
  buildOpenUIPromptSection,
  buildPresentationPromptSection,
  measureAdaptivePromptOverhead,
  measureOpenUIPromptOverhead,
} from './openui-prompt.ts';

describe('openui prompt', () => {
  it('wraps full mode prompt in rich-ui tag with syntax rules', () => {
    const section = buildOpenUIPromptSection();
    assert.match(section, /<rich-ui mode="always">/);
    assert.match(section, /<\/rich-ui>/);
    assert.match(section, /Syntax Rules/);
    assert.doesNotMatch(section, /<<jambu-presentation>>/);
  });

  it('wraps adaptive prompt in rich-ui tag and stays compact', () => {
    const section = buildAdaptiveOpenUIPromptSection();
    assert.match(section, /<rich-ui mode="adaptive">/);
    assert.match(section, /Default to plain markdown prose/);
    assert.doesNotMatch(section, /## Syntax Rules/);
  });

  it('adaptive prompt overhead stays well below full library prompt', () => {
    const adaptive = measureAdaptivePromptOverhead();
    const full = measureOpenUIPromptOverhead();
    assert.ok(adaptive.estimatedTokens < 500);
    assert.ok(adaptive.estimatedTokens < full.estimatedTokens / 2);
  });

  it('buildPresentationPromptSection selects variant', () => {
    assert.equal(buildPresentationPromptSection('none'), null);
    assert.match(buildPresentationPromptSection('adaptive') ?? '', /adaptive/);
    assert.match(buildPresentationPromptSection('full') ?? '', /always/);
  });
});
