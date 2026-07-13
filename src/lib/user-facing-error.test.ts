import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  activityPanelWarningMessage,
  looksLikeInternalErrorMessage,
  toUserFacingActivityErrorMessage,
  toUserFacingArtifactErrorMessage,
  toUserFacingContextUsageErrorMessage,
  toUserFacingErrorMessage,
  toUserFacingRuntimeDispatchErrorMessage,
  toUserFacingRuntimeStreamErrorMessage,
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

  it('maps file-not-found API errors to friendly artifact copy', () => {
    const message = toUserFacingArtifactErrorMessage('File not found');
    assert.equal(message, "This file couldn't be opened. It may have been moved or removed.");
  });

  it('preserves already-safe API messages', () => {
    const message = toUserFacingErrorMessage(
      new Error('agent_id is required'),
      'Unable to load context usage right now.',
    );

    assert.equal(message, 'agent_id is required');
  });
});

describe('toUserFacingActivityErrorMessage', () => {
  it('replaces internal sqlite output with activity fallback', () => {
    const message = toUserFacingActivityErrorMessage(
      new Error(
        "Command failed: sqlite3 /Users/dev/.cursor/projects/foo/index.db SELECT run_id FROM runs;",
      ),
    );

    assert.equal(message, 'Unable to load activity right now. Try again in a moment.');
  });
});

describe('toUserFacingContextUsageErrorMessage', () => {
  it('replaces internal sqlite output with context usage fallback', () => {
    const message = toUserFacingContextUsageErrorMessage(
      new Error(
        "Command failed: sqlite3 /Users/dev/.cursor/projects/foo/index.db SELECT run_id FROM runs;",
      ),
    );

    assert.equal(message, 'Unable to load context usage right now. Try again in a moment.');
  });
});

describe('activityPanelWarningMessage', () => {
  it('returns generic partial warning for internal errors', () => {
    const message = activityPanelWarningMessage(
      new Error('Command failed: sqlite3 /Users/dev/index.db SELECT 1;'),
    );

    assert.equal(message, 'Some activity details may be incomplete.');
  });
});

describe('toUserFacingRuntimeDispatchErrorMessage', () => {
  it('replaces dispatch errors with phase and request_id metadata', () => {
    const message = toUserFacingRuntimeDispatchErrorMessage(
      'Runtime dispatch failed\nphase: chat.sdk.dispatch\nrequest_id: req-123',
    );

    assert.equal(message, "We couldn't start this run. Try again in a moment.");
  });
});

describe('toUserFacingRuntimeStreamErrorMessage', () => {
  it('replaces internal stream failures with friendly copy', () => {
    const message = toUserFacingRuntimeStreamErrorMessage(
      new Error('Command failed: sqlite3 /Users/dev/index.db SELECT 1;'),
    );

    assert.equal(message, 'Something went wrong while generating the response. Try again in a moment.');
  });
});
