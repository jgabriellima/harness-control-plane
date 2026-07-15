import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyHubEvent, beginTurn, createConversationState } from './runtime-hub-store.ts';

describe('applyHubEvent assistant spacing', () => {
  it('merges token-level streaming chunks without inserting mid-word spaces', () => {
    let state = createConversationState('conv-1');
    state = beginTurn(state, 'user-1', 'assistant-1', 'hello', 'run-1');

    for (const text of ['Ret', 'om', 'ando', ':', ' vou', ' ver', 'ific', 'ar']) {
      state = applyHubEvent(
        state,
        {
          type: 'assistant',
          run_id: 'run-1',
          agent_id: 'agent-1',
          conversation_id: 'conv-1',
          timestamp: new Date().toISOString(),
          payload: { text },
        },
        'assistant-1',
        'thinking-1',
      );
    }

    const assistant = state.messages.find((message) => message.id === 'assistant-1');
    assert.equal(assistant?.content, 'Retomando: vou verificar');
  });

  it('treats run_complete error status as a failed turn with visible message', () => {
    let state = createConversationState('conv-1');
    state = beginTurn(state, 'user-1', 'assistant-1', 'hello', 'run-1');

    state = applyHubEvent(
      state,
      {
        type: 'run_complete',
        run_id: 'run-1',
        agent_id: 'agent-1',
        conversation_id: 'conv-1',
        timestamp: new Date().toISOString(),
        payload: { status: 'error', message: 'Authentication error' },
      },
      'assistant-1',
      'thinking-1',
    );

    assert.equal(state.runPhase, 'failed');
    assert.equal(state.error, 'Authentication error');
    const assistant = state.messages.find((message) => message.id === 'assistant-1');
    assert.equal(assistant?.role, 'system');
    assert.equal(assistant?.content, 'Authentication error');
  });

  it('replaces cumulative assistant snapshots instead of duplicating', () => {
    let state = createConversationState('conv-1');
    state = beginTurn(state, 'user-1', 'assistant-1', 'hello', 'run-1');

    state = applyHubEvent(
      state,
      {
        type: 'assistant',
        run_id: 'run-1',
        agent_id: 'agent-1',
        conversation_id: 'conv-1',
        timestamp: new Date().toISOString(),
        payload: { text: 'template' },
      },
      'assistant-1',
      'thinking-1',
    );

    state = applyHubEvent(
      state,
      {
        type: 'assistant',
        run_id: 'run-1',
        agent_id: 'agent-1',
        conversation_id: 'conv-1',
        timestamp: new Date().toISOString(),
        payload: { text: 'template corporativo pronto' },
      },
      'assistant-1',
      'thinking-1',
    );

    const assistant = state.messages.find((message) => message.id === 'assistant-1');
    assert.equal(assistant?.content, 'template corporativo pronto');
  });
});
