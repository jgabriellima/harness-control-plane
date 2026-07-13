import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  normalizeDecodedContextWindowSize,
  resolveContextWindowSizeForModel,
  resolveRuntimeModelId,
} from './context-usage-config.ts';

describe('context-usage-config', () => {
  it('resolves composer 2.5 context window to 200K', () => {
    assert.equal(resolveContextWindowSizeForModel('composer-2.5'), 200_000);
  });

  it('falls back to default model id when process env is unavailable', () => {
    assert.equal(resolveRuntimeModelId(), 'composer-2.5');
  });

  it('rejects mis-decoded small max token values', () => {
    assert.equal(
      normalizeDecodedContextWindowSize({
        maxTokens: 4263,
        usedTokens: 149_500,
        modelId: 'composer-2.5',
      }),
      200_000,
    );
  });

  it('accepts valid checkpoint max token values', () => {
    assert.equal(
      normalizeDecodedContextWindowSize({
        maxTokens: 200_000,
        usedTokens: 149_500,
        modelId: 'composer-2.5',
      }),
      200_000,
    );
  });
});
