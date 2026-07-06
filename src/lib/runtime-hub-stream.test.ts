import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { joinAssistantTextBlocks } from './assistant-text.ts';
import { wireFromSdkMessage } from './runtime-hub-stream.ts';

describe('wireFromSdkMessage assistant text', () => {
  it('preserves markdown structure across multiple text blocks', () => {
    const wire = wireFromSdkMessage(
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'ajuste' },
            { type: 'text', text: 'Outcome' },
            { type: 'text', text: '---' },
            { type: 'text', text: '## Briefing' },
            { type: 'text', text: '| Col A | Col B |' },
            { type: 'text', text: '|-------|-------|' },
            { type: 'text', text: '| 1 | 2 |' },
          ],
        },
      } as Parameters<typeof wireFromSdkMessage>[0],
      'run-1',
      'agent-1',
      'conv-1',
    );

    assert.ok(wire);
    assert.equal(wire?.type, 'assistant');

    const expected = joinAssistantTextBlocks([
      'ajuste',
      'Outcome',
      '---',
      '## Briefing',
      '| Col A | Col B |',
      '|-------|-------|',
      '| 1 | 2 |',
    ]);

    assert.equal(wire?.payload.text, expected);
  });
});
