import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildSandboxOpenUrlRecipe,
  sandboxNameForConversation,
} from './runtime-computer-use-sandbox-bridge.ts';
import { buildComputerUsePromptInjection } from './runtime-computer-use-types.ts';

describe('sandboxNameForConversation', () => {
  it('proposes deterministic jambu-cua-{slug} from conversation id', () => {
    const id = 'conv-20260708T161221-6c8ol3';
    const proposed = sandboxNameForConversation(id);
    const slug = id.replace(/[^a-zA-Z0-9-]/g, '').slice(-24).toLowerCase();
    assert.equal(proposed, `jambu-cua-${slug}`);
    assert.ok(proposed.startsWith('jambu-cua-'));
  });
});

describe('buildComputerUsePromptInjection sandbox', () => {
  it('injects open_url_recipe and forbids manifest write when ready', () => {
    const text = buildComputerUsePromptInjection({
      capabilityAvailable: true,
      sessionEnabled: true,
      targetMode: 'sandbox',
      allowForegroundCursor: false,
      consentedAt: null,
      sandboxReady: true,
      sandboxName: 'jambu-cua-v-20260708t161221-6c8ol3',
      sandboxApiPort: 62495,
      sandboxVncPort: 62496,
      sandboxOpenUrlRecipe:
        'python3 /hcp/scripts/cua_sandbox_action.py open-url --sandbox jambu-cua-v-20260708t161221-6c8ol3 --url <url>',
    });

    assert.ok(text);
    assert.ok(text.includes('[computer_use_sandbox: ready]'));
    assert.ok(text.includes('sandbox_name=jambu-cua-v-20260708t161221-6c8ol3'));
    assert.ok(text.includes('open_url_recipe='));
    assert.ok(text.includes('cua_sandbox_action.py open-url'));
    assert.equal(text.includes('Register sandbox state'), false);
    assert.ok(text.includes('do not write'));
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
