import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mergeActiveRunEntries } from './runtime-active-runs.ts';
import type { ActiveRunEntry } from './runtime-run-registry.ts';

describe('runtime-active-runs merge', () => {
  const diskEntry: ActiveRunEntry = {
    runId: 'run-disk',
    conversationId: 'conv-1',
    agentId: 'agent-1',
    startedAt: '2026-07-07T18:00:00.000Z',
  };

  const memoryEntry: ActiveRunEntry = {
    runId: 'run-live',
    conversationId: 'conv-2',
    agentId: 'agent-2',
    startedAt: '2026-07-07T19:00:00.000Z',
  };

  it('includes in-memory runs missing from disk index', () => {
    const merged = mergeActiveRunEntries([diskEntry], [memoryEntry]);
    assert.equal(merged.length, 2);
    assert.ok(merged.some((entry) => entry.runId === 'run-live'));
  });

  it('prefers in-memory entry when run id overlaps disk', () => {
    const merged = mergeActiveRunEntries(
      [{ ...diskEntry, conversationId: 'conv-stale' }],
      [{ ...diskEntry, conversationId: 'conv-live' }],
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.conversationId, 'conv-live');
  });
});
