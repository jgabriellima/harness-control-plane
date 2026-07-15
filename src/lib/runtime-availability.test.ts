import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resetRuntimeAvailabilityForTests } from './runtime-availability.ts';
import { resetRuntimeAuthGateForTests } from './runtime-sdk-auth-gate.ts';

describe('runtime-availability', () => {
  it('exports assertRuntimeAvailable', async () => {
    const module = await import('./runtime-availability.ts');
    assert.equal(typeof module.assertRuntimeAvailable, 'function');
    resetRuntimeAvailabilityForTests();
    resetRuntimeAuthGateForTests();
  });
});
