import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyContinuableRunState,
  applyActiveRunToConversationState,
  applyInterruptedConversationState,
  applyRecoveredCompletedConversationState,
  findActiveRunForConversation,
  resolveTurnTrackingForActiveRun,
  type ActiveRunRegistryEntry,
  type ContinuableRunRegistryEntry,
} from './active-run-sync.ts';
import { createConversationState } from './runtime-hub-store.ts';

describe('active-run-sync', () => {
  const entry: ActiveRunRegistryEntry = {
    runId: 'run-test-1',
    conversationId: 'conv-test-1',
    agentId: 'agent-test-1',
    startedAt: '2026-07-03T19:00:00.000Z',
  };

  const continuableEntry: ContinuableRunRegistryEntry = {
    ...entry,
    resumable: true,
    message: 'Session interrupted — continue?',
    resumePrompt: 'Continue from where you left off.',
    reason: 'session_boundary',
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

  it('applyActiveRunToConversationState seeds user bubble from title when transcript is empty', () => {
    const base = createConversationState('conv-test-1');
    base.title = 'Check Confluence access';

    const next = applyActiveRunToConversationState(base, entry);

    assert.ok(next.messages.some((message) => message.role === 'user'));
    assert.equal(next.messages.find((message) => message.role === 'user')?.content, 'Check Confluence access');
  });

  it('applyContinuableRunState marks continuable without streaming assistant', () => {
    const base = createConversationState('conv-test-1');
    const next = applyContinuableRunState(base, continuableEntry);

    assert.equal(next.runPhase, 'continuable');
    assert.equal(next.activeRunId, 'run-test-1');
    assert.equal(next.continuableRun?.message, continuableEntry.message);
    assert.ok(next.messages.every((message) => !message.streaming));
  });

  it('applyRecoveredCompletedConversationState clears streaming without error', () => {
    const base = applyActiveRunToConversationState(createConversationState('conv-test-1'), entry);
    const next = applyRecoveredCompletedConversationState(base);

    assert.equal(next.runPhase, 'idle');
    assert.equal(next.activeRunId, null);
    assert.equal(next.error, null);
    assert.ok(next.messages.every((message) => !message.streaming));
  });

  it('applyInterruptedConversationState clears streaming and marks interrupted', () => {
    const base = applyActiveRunToConversationState(createConversationState('conv-test-1'), entry);
    const next = applyInterruptedConversationState(base, 'Run interrupted');

    assert.equal(next.runPhase, 'interrupted');
    assert.equal(next.activeRunId, null);
    assert.equal(next.error, 'Run interrupted');
    assert.ok(next.messages.every((message) => !message.streaming));
  });
});

describe('resolveTurnTrackingForActiveRun', () => {
  it('reuses streaming assistant ids when present', () => {
    const state = createConversationState('conv-test-1');
    state.messages = [
      {
        id: 'assistant-live',
        role: 'assistant',
        content: 'partial',
        streaming: true,
        recordedAt: '2026-07-03T19:00:00.000Z',
      },
    ];

    const tracking = resolveTurnTrackingForActiveRun(state, 'run-test-1');
    assert.equal(tracking.assistantMessageId, 'assistant-live');
  });
});
