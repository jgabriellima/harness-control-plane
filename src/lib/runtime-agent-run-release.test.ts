import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isAgentBusyError } from './runtime-agent-run-release.ts';

describe('runtime-agent-run-release', () => {
  it('isAgentBusyError matches SDK busy message', () => {
    const error = new Error('Agent agent-123 already has active run');
    assert.equal(isAgentBusyError(error), true);
  });

  it('isAgentBusyError matches AgentBusyError name', () => {
    const error = new Error('busy');
    error.name = 'AgentBusyError';
    assert.equal(isAgentBusyError(error), true);
  });

  it('isAgentBusyError rejects unrelated errors', () => {
    assert.equal(isAgentBusyError(new Error('network request failed')), false);
  });
});
