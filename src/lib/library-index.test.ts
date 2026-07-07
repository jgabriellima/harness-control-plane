import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { listProjectLibraryItems } from './library-index.ts';

const hostRepo =
  process.env.CONTROL_PLANE_HOST_REPO?.trim() ??
  join(import.meta.dirname, '../../../business-workflow');
const WORKSPACE_ROOT = join(hostRepo, 'workspaces/default');

describe('library-index', () => {
  it('lists workflow output files for a workspace project', async (t) => {
    const workflowOutput = join(
      WORKSPACE_ROOT,
      '.business',
      'workflows',
      'output',
    );
    if (!existsSync(workflowOutput)) {
      t.skip('local workspace workflow output not present');
    }

    const items = await listProjectLibraryItems(WORKSPACE_ROOT, 'default', 'default', {
      kind: 'files',
      query: 'deck.html',
    });

    const match = items.find((item) => item.name === 'deck.html');
    assert.ok(match);
    assert.equal(match.projectId, 'default');
    assert.equal(match.source, 'workflow-output');
    assert.ok(match.size > 0);
    assert.ok(match.modifiedAt.length > 0);
  });

  it('filters image files when kind=images', async (t) => {
    if (!existsSync(WORKSPACE_ROOT)) {
      t.skip('local default workspace not present');
    }

    const items = await listProjectLibraryItems(WORKSPACE_ROOT, 'default', 'default', {
      kind: 'images',
    });
    if (items.length === 0) {
      t.skip('no image files in default workspace');
    }

    assert.ok(items.every((item) => item.kind === 'image'));
  });
});
