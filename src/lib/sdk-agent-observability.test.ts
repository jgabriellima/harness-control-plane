import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { collectGeneratedFilesFromToolCalls, mergeToolCallRecord } from './sdk-agent-observability.ts';
import type { SdkToolCallRecord } from './sdk-agent-observability-types.ts';

describe('sdk-agent-observability', () => {
  it('collects mutation files from write tool calls', () => {
    const toolCalls: SdkToolCallRecord[] = [
      {
        callId: 'call-1',
        runId: 'run-1',
        turnNumber: 1,
        tool: 'Write',
        status: 'completed',
        args: { path: 'src/components/react/ChatPane.tsx' },
        recordedAt: '2026-07-12T10:00:00.000Z',
      },
      {
        callId: 'call-2',
        runId: 'run-1',
        turnNumber: 1,
        tool: 'Grep',
        status: 'completed',
        args: { pattern: 'agentId', path: 'src/' },
        recordedAt: '2026-07-12T10:01:00.000Z',
      },
    ];

    const files = collectGeneratedFilesFromToolCalls(toolCalls);

    assert.equal(files.length, 2);
    const writeFile = files.find((file) => file.path === 'src/components/react/ChatPane.tsx');
    const grepFile = files.find((file) => file.path === 'src/');
    assert.ok(writeFile);
    assert.equal(writeFile.mutation, true);
    assert.ok(grepFile);
    assert.equal(grepFile.mutation, false);
  });

  it('deduplicates paths per call id', () => {
    const toolCalls: SdkToolCallRecord[] = [
      {
        callId: 'call-1',
        runId: 'run-1',
        turnNumber: 1,
        tool: 'edit',
        status: 'completed',
        args: { file_path: 'src/lib/foo.ts' },
        recordedAt: '2026-07-12T10:00:00.000Z',
      },
      {
        callId: 'call-1',
        runId: 'run-1',
        turnNumber: 1,
        tool: 'edit',
        status: 'completed',
        args: { file_path: 'src/lib/foo.ts' },
        recordedAt: '2026-07-12T10:00:01.000Z',
      },
    ];

    const files = collectGeneratedFilesFromToolCalls(toolCalls);
    assert.equal(files.length, 1);
  });

  it('sorts generated files by recordedAt descending', () => {
    const toolCalls: SdkToolCallRecord[] = [
      {
        callId: 'call-old',
        runId: 'run-1',
        turnNumber: 1,
        tool: 'Write',
        status: 'completed',
        args: { path: 'a.ts' },
        recordedAt: '2026-07-12T09:00:00.000Z',
      },
      {
        callId: 'call-new',
        runId: 'run-2',
        turnNumber: 2,
        tool: 'Write',
        status: 'completed',
        args: { path: 'b.ts' },
        recordedAt: '2026-07-12T11:00:00.000Z',
      },
    ];

    const files = collectGeneratedFilesFromToolCalls(toolCalls);
    assert.deepEqual(
      files.map((file) => file.path),
      ['b.ts', 'a.ts'],
    );
  });

  it('merges run stream events and computes duration for completed tools', () => {
    const running: SdkToolCallRecord = {
      callId: 'call-1',
      runId: 'run-1',
      turnNumber: 1,
      tool: 'Shell',
      status: 'running',
      args: { command: 'echo hi' },
      startedAt: '2026-07-12T10:00:00.000Z',
      recordedAt: '2026-07-12T10:00:00.000Z',
    };
    const completed: SdkToolCallRecord = {
      callId: 'call-1',
      runId: 'run-1',
      turnNumber: 1,
      tool: 'Shell',
      status: 'completed',
      args: { command: 'echo hi' },
      result: { output: 'hi' },
      startedAt: '2026-07-12T10:00:00.000Z',
      recordedAt: '2026-07-12T10:00:02.500Z',
    };

    const merged = mergeToolCallRecord(
      mergeToolCallRecord(undefined, running),
      completed,
    );

    assert.equal(merged.status, 'completed');
    assert.equal(merged.durationMs, 2500);
    assert.deepEqual(merged.result, { output: 'hi' });
  });
});
