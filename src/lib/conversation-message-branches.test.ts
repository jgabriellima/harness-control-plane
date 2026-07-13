import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChatMessage } from './runtime-hub-types';
import {
  findUserMessageIndex,
  getVersionCount,
  prepareEditBranch,
  switchBranchVersion,
} from './conversation-message-branches';

function user(id: string, content: string, anchorId?: string): ChatMessage {
  return {
    id,
    role: 'user',
    content,
    branchAnchorId: anchorId,
  };
}

function assistant(id: string, content: string): ChatMessage {
  return {
    id,
    role: 'assistant',
    content,
  };
}

test('prepareEditBranch truncates downstream and records a new version', () => {
  const messages: ChatMessage[] = [
    user('user-1', 'hello', 'anchor-1'),
    assistant('assistant-1', 'hi there'),
    user('user-2', 'follow up'),
    assistant('assistant-2', 'response'),
  ];

  const result = prepareEditBranch({}, messages, 'user-1', 'hello edited');
  assert.ok(result);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0]?.content, 'hello edited');
  assert.equal(getVersionCount(result.store, 'anchor-1'), 2);
});

test('switchBranchVersion restores prior downstream messages', () => {
  const messages: ChatMessage[] = [
    user('user-1', 'hello edited', 'anchor-1'),
    assistant('assistant-new', 'new response'),
  ];

  const prepared = prepareEditBranch(
    {},
    [
      user('user-1', 'hello', 'anchor-1'),
      assistant('assistant-1', 'hi there'),
    ],
    'user-1',
    'hello edited',
  );
  assert.ok(prepared);

  const switched = switchBranchVersion(prepared.store, prepared.messages, 'anchor-1', 'prev');
  assert.ok(switched);
  assert.equal(switched.messages.length, 2);
  assert.equal(switched.messages[0]?.content, 'hello');
  assert.equal(switched.messages[1]?.content, 'hi there');
});

test('findUserMessageIndex returns index for user role only', () => {
  const messages: ChatMessage[] = [
    user('user-1', 'one'),
    assistant('assistant-1', 'two'),
  ];
  assert.equal(findUserMessageIndex(messages, 'user-1'), 0);
  assert.equal(findUserMessageIndex(messages, 'assistant-1'), -1);
});
