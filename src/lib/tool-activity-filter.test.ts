import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectUniqueToolNames,
  DEFAULT_TOOL_ACTIVITY_FILTER,
  filterAndSortToolActivityEntries,
  isToolSelected,
  toggleToolSelection,
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

  it('filters by selected tools', () => {
    const result = filterAndSortToolActivityEntries(sampleEntries, {
      ...DEFAULT_TOOL_ACTIVITY_FILTER,
      selectedTools: ['grep'],
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
  it('returns sorted unique tool names case-insensitively', () => {
    const entries: ToolActivityEntry[] = [
      ...sampleEntries,
      {
        id: '4',
        tool: { name: 'Grep', status: 'completed' },
      },
      {
        id: '5',
        tool: { name: 'Glob', status: 'completed' },
      },
    ];

    assert.deepEqual(collectUniqueToolNames(entries), ['glob', 'grep', 'shell']);
  });
});

describe('toggleToolSelection', () => {
  const toolNames = ['shell', 'grep', 'glob'];

  it('unchecking from all-selected collapses to all except one', () => {
    assert.deepEqual(toggleToolSelection('grep', toolNames, []), ['shell', 'glob']);
  });

  it('selecting all tools collapses back to empty (show all)', () => {
    assert.deepEqual(toggleToolSelection('glob', toolNames, ['shell', 'grep']), []);
    assert.equal(isToolSelected('glob', toolNames, []), true);
  });
});
