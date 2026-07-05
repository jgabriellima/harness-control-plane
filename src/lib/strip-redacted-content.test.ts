import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { stripRedactedReasoningContent } from './strip-redacted-content';

describe('stripRedactedReasoningContent', () => {
  it('removes trailing redacted reasoning suffix from assistant text', () => {
    const input = 'Hi. What do you want to work on?\n\n[REDACTED]';
    assert.equal(stripRedactedReasoningContent(input), 'Hi. What do you want to work on?');
  });

  it('returns empty string when content is only the redacted token', () => {
    assert.equal(stripRedactedReasoningContent('[REDACTED]'), '');
    assert.equal(stripRedactedReasoningContent('  [REDACTED]  '), '');
  });

  it('preserves unrelated bracket text', () => {
    const input = 'See [REDACTED] section in docs';
    assert.equal(stripRedactedReasoningContent(input), 'See [REDACTED] section in docs');
  });
});
