import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { findRecentPlaybookArtifactRelativePath } from './workspace-files.ts';

const hostRepo =
  process.env.CONTROL_PLANE_HOST_REPO?.trim() ??
  join(import.meta.dirname, '../../../business-workflow');
const WORKSPACE_ROOT = join(hostRepo, 'workspaces/default');
const HARNESS_ROOT = join(WORKSPACE_ROOT, '.business');

describe('workspace-files playbook artifact resolution', () => {
  it('finds deck.html in the most recent playbook run artifacts tree', async (t) => {
    if (!existsSync(join(HARNESS_ROOT, 'playbooks', 'runs'))) {
      t.skip('local workspace playbook runs not present');
    }

    const relative = await findRecentPlaybookArtifactRelativePath('deck.html', HARNESS_ROOT);
    assert.ok(relative);
    assert.match(relative, /playbooks\/runs\/playbook-.*\/artifacts\/.*\/deck\.html$/);
  });
});
