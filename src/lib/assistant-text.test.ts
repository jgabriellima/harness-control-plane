import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { joinAssistantTextBlocks } from './assistant-text.ts';

describe('joinAssistantTextBlocks', () => {
  it('joins multiple blocks with newlines preserving GFM structure', () => {
    const blocks = [
      'ajuste',
      'Outcome',
      '---',
      '## Briefing',
      '| Col A | Col B |',
      '|-------|-------|',
      '| 1 | 2 |',
    ];

    const joined = joinAssistantTextBlocks(blocks);

    assert.equal(joined.includes('ajuste\nOutcome'), true);
    assert.equal(joined.includes('---\n## Briefing'), true);
    assert.equal(joined.includes('| Col A | Col B |\n|-------|-------|'), true);
  });

  it('trims blocks and drops empty entries', () => {
    assert.equal(joinAssistantTextBlocks(['  hello  ', '', '   ', 'world']), 'hello\nworld');
  });

  it('returns empty string for no content', () => {
    assert.equal(joinAssistantTextBlocks([]), '');
    assert.equal(joinAssistantTextBlocks(['', '  ']), '');
  });
});
