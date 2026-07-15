import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildSandboxOpenUrlRecipe,
  normalizeProjectId,
  sandboxNameForProject,
  sandboxNameForConversation,
} from './runtime-computer-use-sandbox-bridge.ts';
import { buildComputerUsePromptInjection } from './runtime-computer-use-types.ts';
import { isSandboxToolName } from './runtime-computer-use-sandbox-tools.ts';

describe('sandboxNameForProject', () => {
  it('proposes deterministic jambu-cua-proj-{slug} from project id', () => {
    const id = 'default';
    const proposed = sandboxNameForProject(id);
    assert.equal(proposed, 'jambu-cua-proj-default');
    assert.ok(proposed.startsWith('jambu-cua-proj-'));
  });

  it('shares one name per project regardless of conversation', () => {
    const a = sandboxNameForProject('acme-corp');
    const b = sandboxNameForProject('acme-corp');
    assert.equal(a, b);
    assert.notEqual(a, sandboxNameForProject('other'));
  });
});

describe('sandboxNameForConversation (legacy alias)', () => {
  it('delegates to project naming', () => {
    const id = 'conv-20260708T161221-6c8ol3';
    assert.equal(sandboxNameForConversation(id), sandboxNameForProject(id));
  });
});

describe('normalizeProjectId', () => {
  it('defaults empty to default', () => {
    assert.equal(normalizeProjectId(''), 'default');
    assert.equal(normalizeProjectId(undefined), 'default');
  });
});

describe('buildComputerUsePromptInjection sandbox', () => {
  it('injects sandbox tools and forbids web search when ready', () => {
    const text = buildComputerUsePromptInjection({
      capabilityAvailable: true,
      sessionEnabled: true,
      targetMode: 'sandbox',
      allowForegroundCursor: false,
      consentedAt: null,
      sandboxReady: true,
      sandboxName: 'jambu-cua-v-proj-default',
      sandboxApiPort: 62495,
      sandboxVncPort: 62496,
      sandboxOpenUrlRecipe:
        'python3 /hcp/scripts/cua_sandbox_action.py open-url --sandbox jambu-cua-v-proj-default --url <url>',
    });

    assert.ok(text);
    assert.ok(text.includes('[computer_use_sandbox: ready]'));
    assert.ok(text.includes('sandbox_name=jambu-cua-v-proj-default'));
    assert.ok(text.includes('sandbox_tools=sandbox_open_url,sandbox_screenshot,sandbox_shell'));
    assert.ok(text.includes('FORBIDDEN in sandbox mode: WebSearch'));
    assert.equal(text.includes('Register sandbox state'), false);
    assert.ok(text.includes('docker ps'));
  });

  it('marks not_ready when sandbox manifest missing', () => {
    const text = buildComputerUsePromptInjection({
      capabilityAvailable: true,
      sessionEnabled: true,
      targetMode: 'sandbox',
      allowForegroundCursor: false,
      consentedAt: null,
      sandboxReady: false,
    });
    assert.ok(text);
    assert.ok(text.includes('[computer_use_sandbox: not_ready]'));
    assert.equal(text.includes('Register sandbox state'), false);
  });
});

describe('buildSandboxOpenUrlRecipe', () => {
  it('points at cua_sandbox_action.py with sandbox name', () => {
    const recipe = buildSandboxOpenUrlRecipe('jambu-cua-v-abc', '/opt/hcp');
    assert.equal(
      recipe,
      'python3 /opt/hcp/scripts/cua_sandbox_action.py open-url --sandbox jambu-cua-v-abc --url <url>',
    );
  });
});

describe('isSandboxToolName', () => {
  it('recognizes sandbox custom tools', () => {
    assert.equal(isSandboxToolName('sandbox_open_url'), true);
    assert.equal(isSandboxToolName('WebSearch'), false);
  });
});
