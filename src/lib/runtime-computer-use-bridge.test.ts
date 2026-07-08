import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { probeComputerUseHealth } from './runtime-computer-use-bridge.ts';

describe('runtime-computer-use-bridge', () => {
  it('probeComputerUseHealth returns ok when cua-driver is reachable', async () => {
    const health = await probeComputerUseHealth();
    assert.equal(typeof health.ok, 'boolean');
    assert.equal(typeof health.latencyMs, 'number');
    assert.ok(health.latencyMs >= 0);
    if (health.ok) {
      assert.equal(health.daemonReachable, true);
      assert.equal(health.error, null);
    } else {
      assert.equal(typeof health.error, 'string');
    }
  });
});
