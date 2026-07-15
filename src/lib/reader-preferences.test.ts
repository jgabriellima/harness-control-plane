import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_READER_PREFERENCES,
  normalizeReaderPreferences,
  readerPreferencesToCssVars,
} from './reader-preferences.ts';

describe('reader preferences', () => {
  it('normalizes invalid values to defaults', () => {
    const normalized = normalizeReaderPreferences({
      fontSize: 'huge',
      lineHeight: 'unknown',
      spacing: 'wide',
    });

    assert.deepEqual(normalized.fontSize, DEFAULT_READER_PREFERENCES.fontSize);
    assert.deepEqual(normalized.lineHeight, DEFAULT_READER_PREFERENCES.lineHeight);
    assert.deepEqual(normalized.spacing, DEFAULT_READER_PREFERENCES.spacing);
  });

  it('maps preferences to css variables', () => {
    const vars = readerPreferencesToCssVars({
      version: 1,
      fontSize: 'lg',
      lineHeight: 'loose',
      spacing: 'airy',
    });

    assert.equal(vars['--chat-font-size'], '1.0625rem');
    assert.equal(vars['--chat-line-height'], '1.8');
    assert.equal(vars['--chat-paragraph-spacing'], '0.875rem');
  });
});
