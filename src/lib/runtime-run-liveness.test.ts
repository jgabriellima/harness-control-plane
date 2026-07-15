import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isSuccessfulTerminalStatus } from './runtime-run-liveness.ts';

describe('runtime-run-liveness', () => {
  it('treats finished as successful terminal status', () => {
    assert.equal(isSuccessfulTerminalStatus('finished'), true);
    assert.equal(isSuccessfulTerminalStatus('completed'), true);
  });

  it('does not treat failed terminal statuses as successful', () => {
    assert.equal(isSuccessfulTerminalStatus('failed'), false);
    assert.equal(isSuccessfulTerminalStatus('error'), false);
    assert.equal(isSuccessfulTerminalStatus('cancelled'), false);
  });
});
