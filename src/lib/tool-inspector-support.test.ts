import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatToolDuration } from './format-tool-duration.ts';
import { toolNamesMatch } from './tool-name-match.ts';

describe('format-tool-duration', () => {
  it('formats sub-second durations in milliseconds', () => {
    assert.equal(formatToolDuration(842), '842ms');
  });

  it('formats second-scale durations', () => {
    assert.equal(formatToolDuration(2500), '2.5s');
  });
});

describe('tool-name-match', () => {
  it('matches definition and invocation casing', () => {
    assert.equal(toolNamesMatch('Shell', 'shell'), true);
    assert.equal(toolNamesMatch('GetMcpTools', 'getmcptools'), true);
    assert.equal(toolNamesMatch('Grep', 'Read'), false);
  });
});
