import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  estimateToolCallInputTokens,
  estimateToolCallOutputTokens,
  estimateToolCallTokens,
} from './estimate-tool-call-tokens.ts';

describe('estimateToolCallTokens', () => {
  it('returns zero for empty payloads', () => {
    assert.equal(estimateToolCallTokens(undefined, undefined), 0);
    assert.equal(estimateToolCallInputTokens(undefined), 0);
    assert.equal(estimateToolCallOutputTokens(undefined), 0);
  });

  it('estimates tokens from args and result text', () => {
    const tokens = estimateToolCallTokens({ path: 'src/foo.ts' }, 'file contents here');
    assert.ok(tokens > 0);
  });

  it('sums args and result contributions', () => {
    const argsOnly = estimateToolCallTokens('abcdefghijklmnop', undefined);
    const both = estimateToolCallTokens('abcdefghijklmnop', 'abcdefghijklmnop');
    assert.ok(both > argsOnly);
    assert.equal(
      estimateToolCallInputTokens('abcdefghijklmnop'),
      estimateToolCallOutputTokens(undefined) + argsOnly,
    );
  });

  it('tracks input and output separately', () => {
    const input = estimateToolCallInputTokens({ path: 'src/foo.ts' });
    const output = estimateToolCallOutputTokens('file contents here');
    assert.equal(estimateToolCallTokens({ path: 'src/foo.ts' }, 'file contents here'), input + output);
  });
});
