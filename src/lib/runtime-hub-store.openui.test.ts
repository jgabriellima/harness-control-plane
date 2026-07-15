import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyHubEvent, beginTurn, createConversationState } from './runtime-hub-store.ts';

describe('applyHubEvent openui parts', () => {
  it('stores typed assistant parts from wire payload', () => {
    let state = createConversationState('conv-1');
    state = beginTurn(state, 'user-1', 'assistant-1', '/openui show metrics', 'run-1');

    state = applyHubEvent(
      state,
      {
        type: 'assistant',
        run_id: 'run-1',
        agent_id: 'agent-1',
        conversation_id: 'conv-1',
        timestamp: new Date().toISOString(),
        payload: {
          text: 'Workspace summary',
          parts: [
            { type: 'text', text: 'Workspace summary' },
            {
              type: 'openui',
              id: 'surface-1',
              format: 'openui-lang',
              schemaVersion: '0.2.8',
              source: 'root = Stack([metric])',
              status: 'streaming',
            },
          ],
        },
      },
      'assistant-1',
      'thinking-1',
    );

    const assistant = state.messages.find((message) => message.id === 'assistant-1');
    assert.equal(assistant?.content, 'Workspace summary');
    assert.equal(assistant?.parts?.length, 2);
    assert.equal(assistant?.parts?.[1]?.type, 'openui');
  });
});
