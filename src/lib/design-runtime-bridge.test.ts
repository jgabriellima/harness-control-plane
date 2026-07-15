import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DesignProjectRecord } from './design-api.ts';
import {
  buildOrchestratorChatRequestBody,
  isOrchestratorWorkspaceProject,
  resolveOrchestratorHarnessProjectId,
  resolveOrchestratorWorkspaceRoot,
} from './design-runtime-bridge.ts';

function orchestratorProject(
  overrides: Partial<DesignProjectRecord> = {},
): DesignProjectRecord {
  return {
    id: 'design-project-1',
    name: 'SDLC scratch',
    metadata: {
      kind: 'prototype',
      baseDir: '/var/harness/workspaces/BUSIN-61/scratch',
      orchestratorWorkspace: {
        kind: 'scratch',
        sourceLabel: 'checkout:feat/BUSIN-61',
        sourceRef: 'feat/BUSIN-61@abc123',
        baseRevision: 'abc123',
        writeback: 'external',
      },
    },
    ...overrides,
  };
}

describe('isOrchestratorWorkspaceProject', () => {
  it('returns true when scratch provenance and baseDir are present', () => {
    assert.equal(isOrchestratorWorkspaceProject(orchestratorProject()), true);
  });

  it('returns false for OD-owned projects without orchestrator metadata', () => {
    assert.equal(
      isOrchestratorWorkspaceProject({
        id: 'od-owned',
        name: 'Landing page',
        metadata: { kind: 'prototype' },
      }),
      false,
    );
  });

  it('returns false when orchestrator metadata lacks baseDir', () => {
    assert.equal(
      isOrchestratorWorkspaceProject(
        orchestratorProject({
          metadata: {
            kind: 'prototype',
            orchestratorWorkspace: {
              kind: 'scratch',
              writeback: 'external',
            },
          },
        }),
      ),
      false,
    );
  });
});

describe('resolveOrchestratorWorkspaceRoot', () => {
  it('returns trimmed baseDir from project metadata', () => {
    assert.equal(
      resolveOrchestratorWorkspaceRoot(orchestratorProject()),
      '/var/harness/workspaces/BUSIN-61/scratch',
    );
  });

  it('returns null when baseDir is absent', () => {
    assert.equal(
      resolveOrchestratorWorkspaceRoot({
        id: 'missing-base',
        name: 'Missing',
        metadata: { kind: 'prototype' },
      }),
      null,
    );
  });
});

describe('resolveOrchestratorHarnessProjectId', () => {
  it('extracts project id from workspaces container path', () => {
    assert.equal(
      resolveOrchestratorHarnessProjectId('/var/harness/workspaces/BUSIN-61/scratch'),
      'BUSIN-61',
    );
  });

  it('falls back to the last path segment', () => {
    assert.equal(
      resolveOrchestratorHarnessProjectId('/tmp/external-worktree'),
      'external-worktree',
    );
  });
});

describe('buildOrchestratorChatRequestBody', () => {
  it('routes through harness project_id with workspace metadata', () => {
    const body = buildOrchestratorChatRequestBody({
      projectId: 'design-project-1',
      message: 'Refine the hero section',
      workspaceRoot: '/var/harness/workspaces/BUSIN-61/scratch',
      conversationId: 'conv-42',
    });

    assert.equal(body.project_id, 'BUSIN-61');
    assert.equal(body.message, 'Refine the hero section');
    assert.equal(body.mode, 'default');
    assert.equal(body.conversation_id, 'conv-42');
    assert.deepEqual(body.metadata, {
      orchestrator_workspace: true,
      workspace_root: '/var/harness/workspaces/BUSIN-61/scratch',
      design_project_id: 'design-project-1',
      dispatch_surface: 'design_studio',
    });
  });
});
