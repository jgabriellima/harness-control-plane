import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mergeToolCallsWithLiveMessages } from '../hooks/useSdkObservability.ts';
import type { SdkToolCallRecord } from '../lib/sdk-agent-observability-types.ts';

describe('mergeToolCallsWithLiveMessages', () => {
  it('merges live tool messages over SDK records by call id', () => {
    const sdkToolCalls: SdkToolCallRecord[] = [
      {
        callId: 'abc-123',
        runId: 'run-1',
        turnNumber: 1,
        tool: 'Read',
        status: 'completed',
        args: { path: 'old.ts' },
        recordedAt: '2026-07-12T10:00:00.000Z',
      },
    ];

    const merged = mergeToolCallsWithLiveMessages(sdkToolCalls, [
      {
        id: 'tool-abc-123',
        role: 'tool',
        content: 'Write · running',
        toolInput: JSON.stringify({ path: 'new.ts' }),
        recordedAt: '2026-07-12T10:05:00.000Z',
        streaming: true,
      },
    ]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.tool, 'Write');
    assert.equal(merged[0]?.status, 'running');
    assert.deepEqual(merged[0]?.args, { path: 'new.ts' });
  });

  it('sorts merged calls by recordedAt descending', () => {
    const merged = mergeToolCallsWithLiveMessages(
      [
        {
          callId: 'older',
          runId: 'run-1',
          turnNumber: 1,
          tool: 'Read',
          status: 'completed',
          recordedAt: '2026-07-12T09:00:00.000Z',
        },
      ],
      [
        {
          id: 'tool-newer',
          role: 'tool',
          content: 'Grep · completed',
          recordedAt: '2026-07-12T11:00:00.000Z',
        },
      ],
    );

    assert.deepEqual(
      merged.map((call) => call.callId),
      ['newer', 'older'],
    );
  });
});
