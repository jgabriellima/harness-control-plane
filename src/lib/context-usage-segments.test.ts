import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildContextUsageBarSegments } from './context-usage-segments.ts';
import type { ContextUsageSlice } from './context-usage-types.ts';

const slices: ContextUsageSlice[] = [
  {
    category: 'conversation',
    label: 'Conversation',
    tokens: 76_100,
    color: '#e07a5f',
  },
  {
    category: 'tool_definitions',
    label: 'Tool definitions',
    tokens: 6_600,
    color: '#8b5cf6',
    children: Array.from({ length: 18 }, (_, index) => ({
      name: `Tool ${index}`,
      tokens: 100,
    })),
  },
  {
    category: 'rules',
    label: 'Rules',
    tokens: 3_300,
    color: '#34d399',
    children: Array.from({ length: 8 }, (_, index) => ({
      name: `Rule ${index}`,
      tokens: 100,
    })),
  },
];

describe('buildContextUsageBarSegments', () => {
  it('maps slices to window-relative segments with legend labels', () => {
    const snapshot = buildContextUsageBarSegments(slices, 200_000, 87_200);

    assert.equal(snapshot.segments.length, 3);
    assert.equal(snapshot.segments[0]?.legendLabel, 'Conversation');
    assert.equal(snapshot.segments[1]?.legendLabel, 'Tool definitions (18)');
    assert.equal(snapshot.segments[2]?.legendLabel, 'Rules (8)');
    assert.ok(snapshot.usedPercent > 43 && snapshot.usedPercent < 45);
    assert.ok(snapshot.freeTokens > 0);
    assert.ok(snapshot.freePercent > 54 && snapshot.freePercent < 57);
  });

  it('computes used share inside occupied portion', () => {
    const snapshot = buildContextUsageBarSegments(slices, 200_000, 87_200);
    const conversation = snapshot.segments.find((segment) => segment.category === 'conversation');

    assert.ok(conversation);
    assert.ok(conversation.usedPercent > 85);
    assert.ok(conversation.windowPercent > 25);
  });
});
