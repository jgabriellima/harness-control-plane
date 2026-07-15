import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isLiveConversationState,
  resolveHydratedMessages,
  seedUserMessageFromTitle,
} from './conversation-message-seed.ts';
import { createConversationState } from './runtime-hub-store.ts';

describe('conversation-message-seed', () => {
  it('seeds a recovered user bubble from the session title', () => {
    const messages = seedUserMessageFromTitle([], 'verifique o confluence', 'conv-test-1');

    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.role, 'user');
    assert.equal(messages[0]?.content, 'verifique o confluence');
  });

  it('does not duplicate when a user message already exists', () => {
    const existing = [
      {
        id: 'user-1',
        role: 'user' as const,
        content: 'hello',
      },
    ];

    const messages = seedUserMessageFromTitle(existing, 'hello', 'conv-test-1');
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.id, 'user-1');
  });

  it('skips placeholder titles', () => {
    const messages = seedUserMessageFromTitle([], 'New chat', 'conv-test-1');
    assert.equal(messages.length, 0);
  });

  it('detects live streaming conversation state', () => {
    const streaming = createConversationState('conv-test-1');
    streaming.runPhase = 'streaming';
    streaming.messages = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'partial',
        streaming: true,
      },
    ];

    assert.equal(isLiveConversationState(streaming), true);
  });

  it('preserves live SSE messages instead of replacing with stale transcript', () => {
    const live = createConversationState('conv-test-1');
    live.runPhase = 'streaming';
    live.messages = [
      {
        id: 'user-1',
        role: 'user',
        content: 'hello',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'streaming answer',
        streaming: true,
      },
    ];

    const resolved = resolveHydratedMessages(
      live,
      [{ id: 'vendor-1', role: 'assistant', content: 'stale transcript only' }],
      'hello',
      'conv-test-1',
    );

    assert.equal(resolved.length, 2);
    assert.equal(resolved[1]?.content, 'streaming answer');
  });
});
