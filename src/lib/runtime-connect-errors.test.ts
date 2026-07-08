import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Code, ConnectError } from '@connectrpc/connect';

import { isConnectCanceled, isConnectUnauthenticated, formatRuntimeConnectError, isRecoverableRuntimeConnectError } from './runtime-connect-errors.ts';

describe('isConnectCanceled', () => {
  it('detects ConnectError with Code.Canceled', () => {
    assert.equal(isConnectCanceled(new ConnectError('stream closed', Code.Canceled)), true);
  });

  it('detects aborted message text from Connect RPC', () => {
    assert.equal(isConnectCanceled(new Error('[canceled] This operation was aborted')), true);
  });

  it('detects ConnectError with Code.Aborted and ECONNRESET text', () => {
    assert.equal(isConnectCanceled(new ConnectError('[aborted] read ECONNRESET', Code.Aborted)), true);
    assert.equal(isConnectCanceled(new Error('[aborted] read ECONNRESET')), true);
  });

  it('returns false for other errors', () => {
    assert.equal(isConnectCanceled(new Error('network request failed')), false);
    assert.equal(isConnectCanceled(null), false);
  });
});

describe('isConnectUnauthenticated', () => {
  it('detects ConnectError with Code.Unauthenticated', () => {
    assert.equal(isConnectUnauthenticated(new ConnectError('denied', Code.Unauthenticated)), true);
  });

  it('detects unauthenticated message text', () => {
    assert.equal(isConnectUnauthenticated(new Error('[unauthenticated] Error')), true);
  });
});

describe('formatRuntimeConnectError', () => {
  it('maps unauthenticated connect errors to operator guidance', () => {
    const message = formatRuntimeConnectError(
      new ConnectError('[unauthenticated] Error', Code.Unauthenticated),
    );
    assert.match(message, /CURSOR_API_KEY/);
  });
});

describe('isRecoverableRuntimeConnectError', () => {
  it('treats auth, cancel, and abort as recoverable', () => {
    assert.equal(isRecoverableRuntimeConnectError(new ConnectError('denied', Code.Unauthenticated)), true);
    assert.equal(isRecoverableRuntimeConnectError(new ConnectError('x', Code.Canceled)), true);
    assert.equal(
      isRecoverableRuntimeConnectError(new ConnectError('[aborted] read ECONNRESET', Code.Aborted)),
      true,
    );
    assert.equal(isRecoverableRuntimeConnectError(new Error('boom')), false);
  });
});

describe('cancelRunIgnoringConnectAbort', () => {
  it('swallows Connect abort errors from cancel()', async () => {
    const { cancelRunIgnoringConnectAbort } = await import('./runtime-connect-errors.ts');
    await cancelRunIgnoringConnectAbort({
      cancel: async () => {
        throw new ConnectError('[aborted] read ECONNRESET', Code.Aborted);
      },
    });
  });
});
