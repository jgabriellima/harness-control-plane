import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runSandboxPreflight } from './runtime-computer-use-sandbox-preflight.ts';

describe('runSandboxPreflight', () => {
  it('returns structured checks for local sandbox', async () => {
    const result = await runSandboxPreflight({ local: true });
    assert.equal(typeof result.ok, 'boolean');
    assert.equal(typeof result.primaryFailureKind, result.ok ? 'object' : 'string');
    assert.ok(Array.isArray(result.checks));
    assert.ok(result.checks.length >= 2);
    for (const check of result.checks) {
      assert.equal(typeof check.id, 'string');
      assert.equal(typeof check.label, 'string');
      assert.equal(typeof check.ok, 'boolean');
      assert.equal(typeof check.message, 'string');
    }
    if (!result.ok) {
      assert.equal(typeof result.summary, 'string');
      assert.ok(result.summary && result.summary.length > 0);
      const failed = result.checks.find((check) => !check.ok);
      assert.ok(failed);
      assert.equal(typeof failed?.remediation, 'string');
    }
  });

  it('returns cloud preflight checks without docker', async () => {
    const result = await runSandboxPreflight({ local: false });
    assert.ok(result.checks.some((check) => check.id === 'cua_api_key'));
    assert.equal(result.checks.some((check) => check.id === 'docker_daemon'), false);
  });
});
