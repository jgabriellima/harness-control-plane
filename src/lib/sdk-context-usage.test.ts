import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { buildContextUsageReportFromSdk } from './context-usage.ts';
import { decodePromptContextUsageSnapshot } from './sdk-context-usage-decode.ts';

const corpus = {
  repository: 'business-workflow',
  workspaceRoot: '/tmp/workspace',
  tokenizer: 'heuristic:char/4',
  updatedAt: '2026-07-12T00:00:00.000Z',
  entries: [],
  scopeTotals: {},
};

describe('sdk-context-usage-decode', () => {
  it('decodes prompt context usage tree from checkpoint blob fixture', () => {
    const fixturePath = '/tmp/checkpoint-blob.bin';
    let blob: Uint8Array;
    try {
      blob = new Uint8Array(readFileSync(fixturePath));
    } catch {
      return;
    }

    const decoded = decodePromptContextUsageSnapshot(blob);
    assert.ok(decoded);
    assert.ok(decoded.usedTokens > 0);
    assert.ok(decoded.maxTokens > 0);
    assert.ok(decoded.categories.some((entry) => entry.id === 'system_prompt'));
    assert.ok(decoded.categories.some((entry) => entry.id === 'tools'));
  });
});

describe('buildContextUsageReportFromSdk', () => {
  it('maps sdk categories into report slices', () => {
    const report = buildContextUsageReportFromSdk({
      conversationId: 'conv-1',
      title: 'Test',
      agentId: 'agent-test',
      corpus,
      sdkUsage: {
        usedTokens: 10_000,
        maxTokens: 200_000,
        categories: [
          { id: 'system_prompt', label: 'System prompt', tokens: 500 },
          { id: 'tools', label: 'Tool definitions', tokens: 6000 },
          { id: 'rules', label: 'Rules', tokens: 2500 },
        ],
        agentId: 'agent-test',
        checkpointBlobId: 'blob-1',
        updatedAt: '2026-07-12T00:00:00.000Z',
      },
    });

    assert.equal(report.source, 'sdk_checkpoint');
    assert.equal(report.totalTokens, 10_000);
    assert.ok(report.slices.some((slice) => slice.category === 'tool_definitions'));
    assert.ok(report.slices.some((slice) => slice.category === 'conversation'));
  });

  it('renders per-tool children from sdk checkpoint categories', () => {
    const report = buildContextUsageReportFromSdk({
      conversationId: 'conv-1',
      title: 'Test',
      agentId: 'agent-test',
      corpus,
      sdkUsage: {
        usedTokens: 10_000,
        maxTokens: 200_000,
        categories: [
          {
            id: 'tools',
            label: 'Tool definitions',
            tokens: 6000,
            children: [
              { id: 'tool:0', label: 'Shell', tokens: 578 },
              { id: 'tool:1', label: 'Grep', tokens: 565 },
              { id: 'tool:2', label: 'Read', tokens: 177 },
            ],
          },
        ],
        agentId: 'agent-test',
        checkpointBlobId: 'blob-1',
        updatedAt: '2026-07-12T00:00:00.000Z',
      },
    });

    const tools = report.slices.find((slice) => slice.category === 'tool_definitions');
    assert.ok(tools);
    assert.equal(tools.children?.length, 3);
    assert.equal(tools.detail, '3 tools');
    assert.equal(tools.children?.[0]?.name, 'Shell');
    assert.equal(tools.children?.[0]?.tokens, 578);
  });

  it('attaches subagent children with descriptions from checkpoint leaves', () => {
    const report = buildContextUsageReportFromSdk({
      conversationId: 'conv-1',
      title: 'Test',
      agentId: 'agent-test',
      corpus,
      sdkUsage: {
        usedTokens: 10_000,
        maxTokens: 200_000,
        categories: [
          {
            id: 'subagents',
            label: 'Subagent definitions',
            tokens: 684,
            children: [
              {
                id: 'tool:12:subagent:1',
                label: 'explore',
                tokens: 142,
                contentPreview:
                  'Fast, readonly agent specialized for exploring codebases.',
              },
              {
                id: 'tool:12:subagent:4',
                label: 'bugbot',
                tokens: 170,
                contentPreview: 'Use only when the user explicitly asks for a Bugbot-like review.',
              },
            ],
          },
        ],
        agentId: 'agent-test',
        checkpointBlobId: 'blob-1',
        updatedAt: '2026-07-12T00:00:00.000Z',
      },
    });

    const subagents = report.slices.find((slice) => slice.category === 'subagent_definitions');
    assert.ok(subagents);
    assert.equal(subagents.children?.length, 2);
    assert.equal(subagents.children?.[0]?.name, 'Explore');
    assert.ok(subagents.children?.[0]?.contentPreview?.includes('readonly agent'));
    assert.equal(subagents.children?.[1]?.name, 'Bugbot');
  });

  it('renders system prompt child with runtime content preview', () => {
    const report = buildContextUsageReportFromSdk({
      conversationId: 'conv-1',
      title: 'Test',
      agentId: 'agent-test',
      corpus,
      sdkUsage: {
        usedTokens: 10_000,
        maxTokens: 200_000,
        categories: [
          {
            id: 'system_prompt',
            label: 'System prompt',
            tokens: 481,
            children: [
              {
                id: 'system:runtime',
                label: 'Cursor Composer base prompt',
                tokens: 481,
                contentPreview:
                  'You are an AI coding assistant, powered by Composer. You operate in Cursor.',
              },
            ],
          },
        ],
        agentId: 'agent-test',
        checkpointBlobId: 'blob-1',
        updatedAt: '2026-07-12T00:00:00.000Z',
      },
    });

    const systemPrompt = report.slices.find((slice) => slice.category === 'system_prompt');
    assert.ok(systemPrompt);
    assert.equal(systemPrompt.children?.length, 1);
    assert.equal(systemPrompt.children?.[0]?.name, 'Runtime base prompt');
    assert.ok(systemPrompt.children?.[0]?.contentPreview?.includes('AI coding assistant'));
    assert.equal(systemPrompt.children?.[0]?.path, 'runtime://system-prompt');
    assert.equal(
      systemPrompt.children?.[0]?.description,
      'Base runtime instructions injected at the start of every agent session.',
    );
  });

  it('enriches generic SDK rule labels with workspace corpus metadata', () => {
    const report = buildContextUsageReportFromSdk({
      conversationId: 'conv-1',
      title: 'Test',
      agentId: 'agent-test',
      corpus: {
        repository: 'business-workflow',
        workspaceRoot: '/tmp/workspace',
        tokenizer: 'heuristic:char/4',
        updatedAt: '2026-07-12T00:00:00.000Z',
        scopeTotals: {
          '.cursor/rules': 1200,
          '.cursor/memories': 800,
        },
        entries: [
          {
            path: '.cursor/rules/business-harness.mdc',
            scope: '.cursor/rules',
            tokens: 1077,
            loadContext: 'always_injected',
            title: 'Business Harness',
            description: 'Harness runtime contract',
            contentPreview: 'All agent work must go through harness runtime.',
          },
          {
            path: '.cursor/memories/architecture.md',
            scope: '.cursor/memories',
            tokens: 990,
            loadContext: 'always_injected',
            title: 'Architecture Memory',
            contentPreview: 'Stack constraints for Astro blog.',
          },
        ],
      },
      sdkUsage: {
        usedTokens: 10_000,
        maxTokens: 200_000,
        categories: [
          {
            id: 'rules',
            label: 'Rules',
            tokens: 3289,
            children: [
              { id: 'rule:3096', label: 'Rule 1', tokens: 956 },
              { id: 'rule:6920', label: 'Rule 2', tokens: 531 },
            ],
          },
        ],
        agentId: 'agent-test',
        checkpointBlobId: 'blob-1',
        updatedAt: '2026-07-12T00:00:00.000Z',
      },
    });

    const rules = report.slices.find((slice) => slice.category === 'rules');
    assert.ok(rules);
    assert.equal(rules.children?.length, 2);
    assert.ok(rules.children?.every((child) => !/^Rule \d+$/i.test(child.name)));
    assert.ok(rules.children?.every((child) => Boolean(child.path)));
    assert.ok(rules.children?.some((child) => child.contentPreview));
    assert.equal(rules.children?.[0]?.tokenSource, 'sdk_matched');
  });
});
