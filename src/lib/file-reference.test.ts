import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { dedupeArtifactPaths, normalizeArtifactPath } from './file-reference.ts';

describe('artifact path normalization', () => {
  it('collapses absolute paths to .business relative form', () => {
    const absolute =
      '/Users/joaogabriellima/Documents/Work/jambu/business-workflow/workspaces/default/.business/playbooks/runs/playbook-1/artifacts/presentation/deck.pdf';
    assert.equal(
      normalizeArtifactPath(absolute),
      '.business/playbooks/runs/playbook-1/artifacts/presentation/deck.pdf',
    );
  });

  it('dedupes bare filenames in favor of harness paths', () => {
    const deduped = dedupeArtifactPaths([
      'deck.pdf',
      '.business/playbooks/runs/playbook-1/artifacts/presentation/deck.pdf',
      'deck.html',
      '.business/playbooks/runs/playbook-1/artifacts/presentation/deck.html',
    ]);

    assert.deepEqual(deduped, [
      '.business/playbooks/runs/playbook-1/artifacts/presentation/deck.html',
      '.business/playbooks/runs/playbook-1/artifacts/presentation/deck.pdf',
    ]);
  });
});
