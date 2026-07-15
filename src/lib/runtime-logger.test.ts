import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isDebugLogLevel, runtimeLogger, setRuntimeLogLevel } from './runtime-logger.ts';

describe('runtime-logger', () => {
  it('defaults to debug when process env is unavailable', () => {
    setRuntimeLogLevel('debug');
    assert.equal(isDebugLogLevel(), true);
  });

  it('emits structured warn logs without throwing', () => {
    assert.doesNotThrow(() => {
      runtimeLogger.warn('runtime_logger.test', { phase: 'test' });
    });
  });
});
