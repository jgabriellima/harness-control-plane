import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  nodeSqliteAvailable,
  resetRuntimeSdkConfigForTests,
  resolveLocalAgentStore,
} from './runtime-sdk-config.ts';

describe('runtime-sdk-config', () => {
  it('reports node:sqlite availability without throwing', async () => {
    const available = await nodeSqliteAvailable();
    assert.equal(typeof available, 'boolean');
  });

  it('resolveLocalAgentStore returns a store or undefined without throwing', async () => {
    resetRuntimeSdkConfigForTests();
    const store = await resolveLocalAgentStore(process.cwd());
    if (await nodeSqliteAvailable()) {
      assert.equal(store, undefined);
      return;
    }
    assert.notEqual(store, undefined);
  });
});
