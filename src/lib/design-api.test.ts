import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCreateProjectRequest } from './design-api.ts';
import type { CreateProjectRequest } from './design-contracts.ts';
import { buildDesignSrcdoc } from './design-srcdoc.ts';

describe('buildDesignSrcdoc', () => {
  it('wraps HTML fragments in a minimal document shell', () => {
    const srcdoc = buildDesignSrcdoc('<div class="hero">Hello</div>');
    assert.match(srcdoc, /^<!doctype html>/i);
    assert.match(srcdoc, /<meta charset="utf-8"/i);
    assert.match(srcdoc, /<body><div class="hero">Hello<\/div><\/body>/);
  });

  it('passes through full HTML documents unchanged', () => {
    const source = '<!DOCTYPE html><html><head></head><body><p>Ready</p></body></html>';
    assert.equal(buildDesignSrcdoc(source), source);
  });
});

describe('buildCreateProjectRequest', () => {
  it('requires id in the serialized create-project payload shape', () => {
    const request: CreateProjectRequest = buildCreateProjectRequest({
      name: 'Landing page',
      skillId: 'web-prototype',
      pendingPrompt: 'Design a pricing page',
      metadata: { kind: 'prototype' },
    });

    assert.equal(typeof request.id, 'string');
    assert.ok(request.id.length > 0);
    assert.equal(request.name, 'Landing page');
    assert.equal(request.skillId, 'web-prototype');
    assert.equal(request.pendingPrompt, 'Design a pricing page');
    assert.deepEqual(request.metadata, { kind: 'prototype' });
  });

  it('preserves a caller-provided project id', () => {
    const request = buildCreateProjectRequest({
      id: 'project-fixed-id',
      name: 'Deck',
      metadata: { kind: 'deck' },
    });

    assert.equal(request.id, 'project-fixed-id');
    assert.equal(request.name, 'Deck');
    assert.equal(request.metadata?.kind, 'deck');
  });

  it('preserves orchestrator workspace metadata on create-project requests', () => {
    const request = buildCreateProjectRequest({
      name: 'Scratch workspace',
      skillId: 'web-prototype',
      pendingPrompt: 'Refine pricing hero',
      metadata: {
        kind: 'prototype',
        baseDir: '/var/harness/workspaces/BUSIN-61/scratch',
        orchestratorWorkspace: {
          kind: 'scratch',
          sourceLabel: 'checkout:feat/BUSIN-61',
          sourceRef: 'feat/BUSIN-61@abc123',
          writeback: 'external',
        },
      },
    });

    assert.equal(request.metadata?.baseDir, '/var/harness/workspaces/BUSIN-61/scratch');
    assert.equal(request.metadata?.orchestratorWorkspace?.kind, 'scratch');
    assert.equal(request.metadata?.orchestratorWorkspace?.writeback, 'external');
  });
});
