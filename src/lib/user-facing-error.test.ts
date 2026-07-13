import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  looksLikeInternalErrorMessage,
  toUserFacingErrorMessage,
} from './user-facing-error.ts';

describe('looksLikeInternalErrorMessage', () => {
  it('detects sqlite command output with paths and SQL', () => {
    const message =
      "Command failed: sqlite3 /Users/dev/.cursor/projects/foo/sdk-agent-store/index.db SELECT run_id FROM runs WHERE agent_id='agent-1'; Error: in prepare, database is locked (5)";

    assert.equal(looksLikeInternalErrorMessage(message), true);
  });

  it('returns false for short operator-facing copy', () => {
    assert.equal(
      looksLikeInternalErrorMessage('The runtime store is temporarily busy. Try again in a moment.'),
      false,
    );
  });
});

describe('toUserFacingErrorMessage', () => {
  it('maps database lock errors to friendly copy', () => {
    const message = toUserFacingErrorMessage(
      new Error('Error: in prepare, database is locked (5)'),
      'Unable to load context usage right now.',
    );

    assert.equal(message, 'The runtime store is temporarily busy. Try again in a moment.');
  });

  it('replaces leaked sqlite command output with fallback', () => {
    const message = toUserFacingErrorMessage(
      new Error(
        "Command failed: sqlite3 /Users/dev/.cursor/projects/foo/index.db SELECT run_id FROM runs WHERE agent_id='agent-1';",
      ),
      'Unable to load context usage right now.',
    );

    assert.equal(message, 'Unable to load context usage right now.');
  });

  it('preserves already-safe API messages', () => {
    const message = toUserFacingErrorMessage(
      new Error('agent_id is required'),
      'Unable to load context usage right now.',
    );

    assert.equal(message, 'agent_id is required');
  });
});
