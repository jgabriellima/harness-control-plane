import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { estimateToolCallTokens } from './estimate-tool-call-tokens.ts';

describe('estimateToolCallTokens', () => {
  it('returns zero for empty payloads', () => {
    assert.equal(estimateToolCallTokens(undefined, undefined), 0);
  });

  it('estimates tokens from args and result text', () => {
    const tokens = estimateToolCallTokens({ path: 'src/foo.ts' }, 'file contents here');
    assert.ok(tokens > 0);
  });

  it('sums args and result contributions', () => {
    const argsOnly = estimateToolCallTokens('abcdefghijklmnop', undefined);
    const both = estimateToolCallTokens('abcdefghijklmnop', 'abcdefghijklmnop');
    assert.ok(both > argsOnly);
  });
});
