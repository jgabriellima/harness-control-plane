import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractFilePathsFromTool, inferFileActionFromTool } from './tool-file-paths.ts';

describe('tool-file-paths', () => {
  it('extracts write tool path args', () => {
    const paths = extractFilePathsFromTool('Write', {
      path: '.business/playbooks/runs/playbook-1/artifacts/presentation/deck.html',
    });
    assert.deepEqual(paths, [
      '.business/playbooks/runs/playbook-1/artifacts/presentation/deck.html',
    ]);
  });

  it('extracts edit tool file_path args', () => {
    const paths = extractFilePathsFromTool('edit', {
      file_path: 'src/components/react/ChatPane.tsx',
    });
    assert.deepEqual(paths, ['src/components/react/ChatPane.tsx']);
  });

  it('ignores browser tools', () => {
    const paths = extractFilePathsFromTool('browser_navigate', {
      url: 'https://example.com',
    });
    assert.deepEqual(paths, []);
  });

  it('maps mutation tools to file actions', () => {
    assert.equal(inferFileActionFromTool('Write'), 'create');
    assert.equal(inferFileActionFromTool('edit'), 'edit');
    assert.equal(inferFileActionFromTool('Delete'), 'delete');
    assert.equal(inferFileActionFromTool('Grep'), null);
  });
});
