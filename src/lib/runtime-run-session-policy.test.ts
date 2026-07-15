import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildRunSessionSnapshot,
  defaultRunSessionLifecyclePolicy,
  normalizeSessionContinueWirePrompt,
  parseRunSessionLifecyclePolicy,
  partitionRunsBySessionPolicy,
  shouldAutoAttachIndexedRuns,
} from './runtime-run-session-policy.ts';
import type { ActiveRunEntry } from './runtime-run-registry.ts';
import {
  isRunExecutingInProcessSession,
  markRunExecutingInProcessSession,
} from './runtime-process-session.ts';

describe('runtime-run-session-policy', () => {
  const diskRun: ActiveRunEntry = {
    runId: 'run-cold-1',
    conversationId: 'conv-1',
    agentId: 'agent-1',
    startedAt: '2026-07-12T12:00:00.000Z',
  };

  it('parses continuable policy from business.yaml fragment', () => {
    const policy = parseRunSessionLifecyclePolicy({
      runtime: {
        run_session: {
          lifecycle: {
            indexed_at_process_start: 'continuable',
            continuable: {
              resumable: true,
              message: 'Continue?',
            },
          },
        },
      },
    });

    assert.equal(policy.indexedAtProcessStart, 'continuable');
    assert.equal(policy.continuable.message, 'Continue?');
    assert.equal(policy.continuable.resumable, true);
  });

  it('auto-wraps plain resume_prompt text in continue wire tag', () => {
    const wire = normalizeSessionContinueWirePrompt('Resume the interrupted task.');
    assert.match(wire, /^<continue>\n/);
    assert.match(wire, /Resume the interrupted task\.\n<\/continue>$/);
  });

  it('cold start reclassifies disk-indexed runs as continuable', () => {
    const policy = defaultRunSessionLifecyclePolicy();
    const partitioned = partitionRunsBySessionPolicy([diskRun], policy);

    assert.equal(partitioned.executing.length, 0);
    assert.equal(partitioned.continuable.length, 1);
    assert.equal(partitioned.continuable[0]?.reason, 'session_boundary');
    assert.equal(partitioned.continuable[0]?.runId, 'run-cold-1');
  });

  it('executing policy keeps legacy auto-attach behavior', () => {
    const policy = {
      ...defaultRunSessionLifecyclePolicy(),
      indexedAtProcessStart: 'executing' as const,
    };

    assert.equal(shouldAutoAttachIndexedRuns(policy), true);
    const partitioned = partitionRunsBySessionPolicy([diskRun], policy);
    assert.equal(partitioned.executing.length, 1);
    assert.equal(partitioned.continuable.length, 0);
  });

  it('process-session marks runs as executing after dispatch in same session', () => {
    markRunExecutingInProcessSession('run-live-1');
    assert.equal(isRunExecutingInProcessSession('run-live-1'), true);

    const policy = defaultRunSessionLifecyclePolicy();
    const partitioned = partitionRunsBySessionPolicy(
      [
        {
          ...diskRun,
          runId: 'run-live-1',
        },
      ],
      policy,
    );

    assert.equal(partitioned.executing.length, 1);
    assert.equal(partitioned.continuable.length, 0);
  });

  it('buildRunSessionSnapshot exposes executing as deprecated active alias', () => {
    markRunExecutingInProcessSession('run-live-2');
    const snapshot = buildRunSessionSnapshot(
      [
        {
          ...diskRun,
          runId: 'run-live-2',
        },
      ],
      defaultRunSessionLifecyclePolicy(),
    );

    assert.equal(snapshot.executing.length, 1);
    assert.deepEqual(snapshot.active, snapshot.executing);
    assert.equal(typeof snapshot.processSessionId, 'string');
  });
});
