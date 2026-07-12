import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildContextUsageReport, formatContextTokenCount } from './context-usage.ts';
import type { InstructionCorpusSnapshot, RuntimeOverheadEstimate } from './context-usage-types.ts';

const corpus: InstructionCorpusSnapshot = {
  repository: 'business-workflow',
  workspaceRoot: '/tmp/workspace',
  tokenizer: 'heuristic:char/4',
  updatedAt: '2026-07-12T00:00:00.000Z',
  entries: [
    {
      path: '.cursor/rules/architecture.mdc',
      scope: '.cursor/rules',
      tokens: 1200,
      loadContext: 'always_injected',
    },
    {
      path: '.cursor/memories/architecture.md',
      scope: '.cursor/memories',
      tokens: 800,
      loadContext: 'always_injected',
    },
    {
      path: '.cursor/skills/handoff/SKILL.md',
      scope: '.cursor/skills',
      tokens: 500,
      loadContext: 'on_invocation',
    },
    {
      path: '.cursor/agents/planner.md',
      scope: '.cursor/agents',
      tokens: 300,
      loadContext: 'on_invocation',
    },
  ],
  scopeTotals: {
    '.cursor/rules': 1200,
    '.cursor/memories': 800,
    '.cursor/skills': 500,
    '.cursor/agents': 300,
  },
};

const overhead: RuntimeOverheadEstimate = {
  systemPromptTokens: 476,
  toolDefinitionTokens: 8400,
  mcpToolTokens: 2600,
  subagentDefinitionTokens: 300,
  toolCount: 20,
  mcpServerCount: 5,
  subagentCount: 1,
};

describe('context-usage', () => {
  it('builds a report with ordered slices and percent full', () => {
    const report = buildContextUsageReport({
      conversationId: 'conv-1',
      title: 'Dialog close button issue',
      messages: [
        { id: 'm1', role: 'user', content: 'a'.repeat(4000) },
        { id: 'm2', role: 'assistant', content: 'b'.repeat(8000) },
      ],
      corpus,
      overhead,
      contextWindowSize: 200_000,
    });

    assert.ok(report.totalTokens > 0);
    assert.ok(report.percentFull >= 1);
    assert.ok(report.slices.some((slice) => slice.category === 'conversation'));
    assert.ok(report.slices.some((slice) => slice.category === 'rules'));
    assert.ok(report.slices.some((slice) => slice.category === 'tool_definitions'));
  });

  it('formats token counts for display', () => {
    assert.equal(formatContextTokenCount(500), '500');
    assert.equal(formatContextTokenCount(1500), '1.5K');
  });
});
