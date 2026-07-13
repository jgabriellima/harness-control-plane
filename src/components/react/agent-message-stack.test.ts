import assert from 'node:assert/strict';
import test from 'node:test';

import type { StackMessage } from './AgentMessageStack';

type RenderSegment =
  | { kind: 'single'; message: StackMessage }
  | { kind: 'turn'; assistant: StackMessage; thinking?: StackMessage };

function buildSegments(messages: StackMessage[]): RenderSegment[] {
  const filtered = messages.filter((message) => message.role !== 'tool');
  const segments: RenderSegment[] = [];

  for (let index = 0; index < filtered.length; index += 1) {
    const message = filtered[index];

    if (message.role === 'thinking') {
      const next = filtered[index + 1];
      if (next?.role === 'assistant') {
        segments.push({ kind: 'turn', thinking: message, assistant: next });
        index += 1;
        continue;
      }
      segments.push({ kind: 'single', message });
      continue;
    }

    if (message.role === 'assistant') {
      const previous = filtered[index - 1];
      if (previous?.role === 'thinking') {
        continue;
      }
      segments.push({ kind: 'turn', assistant: message });
      continue;
    }

    segments.push({ kind: 'single', message });
  }

  return segments;
}

test('pairs thinking with the following assistant turn', () => {
  const messages: StackMessage[] = [
    { id: 'user-1', role: 'user', content: 'hello' },
    { id: 'thinking-1', role: 'thinking', content: 'searching', streaming: true },
    { id: 'assistant-1', role: 'assistant', content: '', streaming: true },
  ];

  const segments = buildSegments(messages);

  assert.equal(segments.length, 2);
  assert.equal(segments[0]?.kind, 'single');
  assert.equal(segments[1]?.kind, 'turn');
  if (segments[1]?.kind === 'turn') {
    assert.equal(segments[1].thinking?.id, 'thinking-1');
    assert.equal(segments[1].assistant.id, 'assistant-1');
  }
});

test('keeps assistant-only turns when no thinking message exists', () => {
  const messages: StackMessage[] = [
    { id: 'user-1', role: 'user', content: 'hello' },
    { id: 'assistant-1', role: 'assistant', content: 'done', streaming: false },
  ];

  const segments = buildSegments(messages);

  assert.equal(segments.length, 2);
  assert.equal(segments[1]?.kind, 'turn');
  if (segments[1]?.kind === 'turn') {
    assert.equal(segments[1].thinking, undefined);
    assert.equal(segments[1].assistant.id, 'assistant-1');
  }
});
