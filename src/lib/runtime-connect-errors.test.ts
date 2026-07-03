import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Code, ConnectError } from '@connectrpc/connect';

import { isConnectCanceled } from './runtime-connect-errors.ts';

describe('isConnectCanceled', () => {
  it('detects ConnectError with Code.Canceled', () => {
    assert.equal(isConnectCanceled(new ConnectError('stream closed', Code.Canceled)), true);
  });

  it('detects aborted message text from Connect RPC', () => {
    assert.equal(isConnectCanceled(new Error('[canceled] This operation was aborted')), true);
  });

  it('returns false for other errors', () => {
    assert.equal(isConnectCanceled(new Error('network request failed')), false);
    assert.equal(isConnectCanceled(null), false);
  });
});
