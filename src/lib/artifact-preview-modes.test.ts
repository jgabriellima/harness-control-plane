import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  inferArtifactPreviewMode,
  isClientParsedBinaryPreview,
  unsupportedBinaryMessage,
} from './artifact-preview-modes.ts';

describe('artifact preview mode routing', () => {
  it('routes csv to spreadsheet', () => {
    assert.equal(inferArtifactPreviewMode('reports/q1.csv', 'text/csv'), 'spreadsheet');
  });

  it('routes xlsx to spreadsheet', () => {
    assert.equal(
      inferArtifactPreviewMode('data/inventory.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      'spreadsheet',
    );
  });

  it('routes docx to document', () => {
    assert.equal(
      inferArtifactPreviewMode('docs/proposal.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      'document',
    );
  });

  it('routes pptx to presentation', () => {
    assert.equal(
      inferArtifactPreviewMode('slides/deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
      'presentation',
    );
  });

  it('routes glb to model-3d', () => {
    assert.equal(inferArtifactPreviewMode('assets/model.glb', 'model/gltf-binary'), 'model-3d');
  });

  it('routes blend to unsupported-binary', () => {
    assert.equal(inferArtifactPreviewMode('scene.blend', 'application/x-blender'), 'unsupported-binary');
    assert.match(unsupportedBinaryMessage('scene.blend'), /Blender/);
  });

  it('marks client-parsed binary modes', () => {
    assert.equal(isClientParsedBinaryPreview('spreadsheet'), true);
    assert.equal(isClientParsedBinaryPreview('document'), true);
    assert.equal(isClientParsedBinaryPreview('presentation'), true);
    assert.equal(isClientParsedBinaryPreview('model-3d'), true);
    assert.equal(isClientParsedBinaryPreview('pdf'), false);
  });
});
