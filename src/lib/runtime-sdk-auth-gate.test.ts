import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canAttemptRuntimeSdkCall,
  clearRuntimeAuthGate,
  markRuntimeAuthUnavailable,
  resetRuntimeAuthGateForTests,
  runtimeAuthGateSnapshot,
} from './runtime-sdk-auth-gate.ts';

test('auth gate blocks SDK calls after markRuntimeAuthUnavailable', () => {
  resetRuntimeAuthGateForTests();
  assert.equal(canAttemptRuntimeSdkCall(), true);

  markRuntimeAuthUnavailable('auth_failed', 5_000);
  assert.equal(canAttemptRuntimeSdkCall(), false);
  assert.equal(runtimeAuthGateSnapshot().blocked, true);

  clearRuntimeAuthGate();
  assert.equal(canAttemptRuntimeSdkCall(), true);
});
