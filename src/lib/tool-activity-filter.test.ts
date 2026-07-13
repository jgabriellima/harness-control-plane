import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectUniqueToolNames,
  DEFAULT_TOOL_ACTIVITY_FILTER,
  filterAndSortToolActivityEntries,
  type ToolActivityEntry,
} from './tool-activity-filter.ts';

const sampleEntries: ToolActivityEntry[] = [
  {
    id: '1',
    tool: {
      name: 'shell',
      status: 'completed',
      args: { command: 'curl composio' },
      result: { stdout: 'Unauthorized: Authentication failed' },
      recordedAt: '2026-07-12T21:47:59.000Z',
      durationMs: 1200,
    },
  },
  {
    id: '2',
    tool: {
      name: 'grep',
      status: 'completed',
      args: { pattern: 'confluence' },
      result: { matches: 3 },
      recordedAt: '2026-07-12T21:47:50.000Z',
      durationMs: 195,
    },
  },
  {
    id: '3',
    tool: {
      name: 'glob',
      status: 'running',
      recordedAt: '2026-07-12T21:48:10.000Z',
    },
    streaming: true,
  },
];

describe('filterAndSortToolActivityEntries', () => {
  it('filters by tool name query in output payload', () => {
    const result = filterAndSortToolActivityEntries(sampleEntries, {
      ...DEFAULT_TOOL_ACTIVITY_FILTER,
      query: 'unauthorized',
    });

    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, '1');
  });

  it('filters by status', () => {
    const result = filterAndSortToolActivityEntries(sampleEntries, {
      ...DEFAULT_TOOL_ACTIVITY_FILTER,
      statusFilter: 'running',
    });

    assert.equal(result.length, 1);
    assert.equal(result[0]?.tool.name, 'glob');
  });

  it('filters by tool name', () => {
    const result = filterAndSortToolActivityEntries(sampleEntries, {
      ...DEFAULT_TOOL_ACTIVITY_FILTER,
      toolFilter: 'grep',
    });

    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, '2');
  });

  it('sorts by duration descending', () => {
    const result = filterAndSortToolActivityEntries(sampleEntries, {
      ...DEFAULT_TOOL_ACTIVITY_FILTER,
      sortField: 'durationMs',
      sortDirection: 'desc',
    });

    assert.deepEqual(
      result.map((entry) => entry.id),
      ['1', '2', '3'],
    );
  });
});

describe('collectUniqueToolNames', () => {
  it('returns sorted unique tool names', () => {
    assert.deepEqual(collectUniqueToolNames(sampleEntries), ['glob', 'grep', 'shell']);
  });
});
