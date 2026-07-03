import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyActiveRunToConversationState,
  findActiveRunForConversation,
  resolveTurnTrackingForActiveRun,
  type ActiveRunRegistryEntry,
} from './active-run-sync.ts';
import { createConversationState } from './runtime-hub-store.ts';

describe('active-run-sync', () => {
  const entry: ActiveRunRegistryEntry = {
    runId: 'run-test-1',
    conversationId: 'conv-test-1',
    agentId: 'agent-test-1',
    startedAt: '2026-07-03T19:00:00.000Z',
  };

  it('findActiveRunForConversation matches conversation id', () => {
    const found = findActiveRunForConversation([entry], 'conv-test-1');
    assert.equal(found?.runId, 'run-test-1');
    assert.equal(findActiveRunForConversation([entry], 'conv-other'), undefined);
  });

  it('applyActiveRunToConversationState marks streaming with assistant placeholder', () => {
    const base = createConversationState('conv-test-1');
    const next = applyActiveRunToConversationState(base, entry);

    assert.equal(next.runPhase, 'streaming');
    assert.equal(next.activeRunId, 'run-test-1');
    assert.equal(next.agentId, 'agent-test-1');
    assert.ok(next.messages.some((message) => message.role === 'assistant' && message.streaming));
  });

  it('resolveTurnTrackingForActiveRun reuses streaming assistant when present', () => {
    const base = createConversationState('conv-test-1');
    const withAssistant = applyActiveRunToConversationState(base, entry);
    const tracking = resolveTurnTrackingForActiveRun(withAssistant, entry.runId);

    assert.ok(tracking.assistantMessageId.length > 0);
    assert.ok(tracking.thinkingMessageId.length > 0);
  });
});
