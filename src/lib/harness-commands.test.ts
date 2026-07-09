import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

import {
  listHarnessCommands,
  resolveGlobalCommandsWorkspaceRoot,
} from './harness-commands.ts';

const HOST_REPO = process.env.BUSINESS_REPO_ROOT?.trim()
  ? resolve(process.env.BUSINESS_REPO_ROOT.trim())
  : resolve(join(import.meta.dirname, '../../../business-workflow'));
const PLATFORM_ROOT = join(HOST_REPO, 'app');
const WORKSPACE_ROOT = join(HOST_REPO, 'workspaces', 'default');

describe('harness-commands layered registry', () => {
  it('resolves platform root for workspace projects', () => {
    const globalRoot = resolveGlobalCommandsWorkspaceRoot(WORKSPACE_ROOT);
    assert.equal(globalRoot, PLATFORM_ROOT);
  });

  it('returns null when workspace is already the platform shell', () => {
    const globalRoot = resolveGlobalCommandsWorkspaceRoot(PLATFORM_ROOT);
    assert.equal(globalRoot, null);
  });

  it('merges global commands into workspace project without local copies', async () => {
    const commands = await listHarnessCommands(WORKSPACE_ROOT);
    const browser = commands.find((item) => item.command === '/business:runtime:browser');
    assert.ok(browser, 'expected /business:runtime:browser from global layer');
    assert.equal(browser.scope, 'global');
  });

  it('includes workspace-local workflow commands', async () => {
    const commands = await listHarnessCommands(WORKSPACE_ROOT);
    const localWorkflow = commands.find((item) =>
      item.command.startsWith('/business:workflow:presentation-keynote-production'),
    );
    assert.ok(localWorkflow, 'expected a local workflow command in default workspace');
    assert.equal(localWorkflow.scope, 'local');
  });

  it('serves hydrate from global layer when no local copy exists', async () => {
    const commands = await listHarnessCommands(WORKSPACE_ROOT);
    const hydrate = commands.find((item) => item.command === '/business:hydrate');
    assert.ok(hydrate);
    assert.equal(hydrate.scope, 'global');
  });
});
