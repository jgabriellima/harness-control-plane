import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { listWorkspaceMentionFiles } from './workspace-file-index.ts';

const hostRepo =
  process.env.CONTROL_PLANE_HOST_REPO?.trim() ??
  join(import.meta.dirname, '../../../business-workflow');
const WORKSPACE_ROOT = join(hostRepo, 'workspaces/default');

describe('workspace-file-index', () => {
  it('finds playbook artifact files for @ mention autocomplete', async (t) => {
    if (!existsSync(join(WORKSPACE_ROOT, '.business', 'playbooks', 'runs'))) {
      t.skip('local workspace playbook runs not present');
    }

    const files = await listWorkspaceMentionFiles(WORKSPACE_ROOT, 'design-system');
    const match = files.find((file) => file.name === 'design-system.json');
    assert.ok(match);
    assert.ok(
      match.source === 'playbook-artifact' || match.source === 'output',
      `unexpected source: ${match.source}`,
    );
  });
});
