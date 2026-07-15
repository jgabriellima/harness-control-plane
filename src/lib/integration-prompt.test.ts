import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildIntegrationBaselineContract,
  buildIntegrationSlotContext,
} from './integration-prompt.ts';

describe('buildIntegrationBaselineContract', () => {
  it('states MCP-primary and secondary channel paths', () => {
    const contract = buildIntegrationBaselineContract();
    assert.match(contract, /Primary path.*Composio MCP/i);
    assert.match(contract, /Secondary paths/i);
    assert.match(contract, /api, cli/i);
    assert.match(contract, /headless embed/i);
  });
});

describe('buildIntegrationSlotContext', () => {
  it('includes baseline and active slots', () => {
    const context = buildIntegrationSlotContext(['slot.confluence'], undefined);
    assert.match(context, /Primary path.*Composio MCP/i);
    assert.match(context, /slot\.confluence/);
    assert.match(context, /No Composio MCP session/i);
  });

  it('prefers MCP when composio bindings exist', () => {
    const context = buildIntegrationSlotContext(['slot.confluence'], {
      'composio-trs_abc': {
        serverKey: 'composio-trs_abc',
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer x' },
      },
    });
    assert.match(context, /composio-trs_abc/);
    assert.match(context, /Prefer MCP tools/i);
  });
});
