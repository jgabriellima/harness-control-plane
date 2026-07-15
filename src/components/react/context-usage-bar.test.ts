import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildContextUsageReportFromSdk } from '../../lib/context-usage.ts';
import type { ContextUsageReport, InstructionCorpusSnapshot } from '../../lib/context-usage-types.ts';

const corpus: InstructionCorpusSnapshot = {
  repository: 'business-workflow',
  workspaceRoot: '/tmp/workspace',
  tokenizer: 'heuristic:char/4',
  updatedAt: '2026-07-12T00:00:00.000Z',
  entries: [],
  scopeTotals: {},
};

function buildSampleReport(): ContextUsageReport {
  return buildContextUsageReportFromSdk({
    conversationId: 'conv-test',
    title: 'Test',
    agentId: 'agent-test',
    corpus,
    sdkUsage: {
      usedTokens: 87_200,
      maxTokens: 200_000,
      categories: [
        { id: 'summarized_conversation', label: 'Conversation', tokens: 76_100 },
        { id: 'tools', label: 'Tool definitions', tokens: 6_600 },
        { id: 'rules', label: 'Rules', tokens: 3_300 },
        { id: 'subagents', label: 'Subagent definitions', tokens: 684 },
      ],
      agentId: 'agent-test',
      checkpointBlobId: 'blob-test',
      updatedAt: '2026-07-12T00:00:00.000Z',
    },
  });
}

describe('context usage bar data contract', () => {
  it('report slices align with SDK checkpoint totals for segmented bar', () => {
    const report = buildSampleReport();

    assert.equal(report.percentFull, 44);
    assert.equal(report.totalTokens, 87_200);
    assert.equal(report.contextWindowSize, 200_000);

    const sliceTotal = report.slices.reduce((sum, slice) => sum + slice.tokens, 0);
    assert.equal(sliceTotal, report.totalTokens);

    const conversation = report.slices.find((slice) => slice.category === 'conversation');
    assert.ok(conversation);
    assert.ok(conversation.tokens >= 76_100);
    assert.equal(conversation.color, '#e07a5f');
  });

  it('free context is derivable from window size minus used tokens', () => {
    const report = buildSampleReport();
    const freeTokens = report.contextWindowSize - report.totalTokens;

    assert.equal(freeTokens, 112_800);
    assert.ok(freeTokens > 0);
  });
});
