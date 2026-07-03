import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  dedupeArtifactPaths,
  inferMonacoLanguageFromPath,
  isFullscreenCapableArtifact,
  isPresentationHtmlArtifact,
  isSyntaxHighlightedArtifact,
  normalizeArtifactPath,
} from './file-reference.ts';

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

describe('monaco language inference', () => {
  it('maps python artifacts to python', () => {
    assert.equal(
      inferMonacoLanguageFromPath('.business/playbooks/runs/playbook-1/artifacts/export_deck.py'),
      'python',
    );
  });

  it('maps json mime to json even without extension', () => {
    assert.equal(inferMonacoLanguageFromPath('manifest', 'application/json'), 'json');
  });

  it('routes yaml playbooks to syntax viewer', () => {
    assert.equal(
      isSyntaxHighlightedArtifact(
        '.business/playbooks/domains/media/presentation-production.pb.yaml',
        'text/plain',
      ),
      true,
    );
    assert.equal(
      inferMonacoLanguageFromPath('.business/playbooks/domains/media/presentation-production.pb.yaml'),
      'yaml',
    );
  });

  it('routes code artifacts to syntax viewer', () => {
    assert.equal(
      isSyntaxHighlightedArtifact('.business/playbooks/runs/playbook-1/artifacts/export_deck.py', 'text/plain'),
      true,
    );
    assert.equal(isSyntaxHighlightedArtifact('deck.html', 'text/html'), false);
    assert.equal(isSyntaxHighlightedArtifact('notes.md', 'text/markdown'), false);
    assert.equal(isSyntaxHighlightedArtifact('sample.pdf', 'application/pdf'), false);
  });
});

describe('presentation html detection', () => {
  it('detects deck.html by basename', () => {
    assert.equal(
      isPresentationHtmlArtifact('.business/playbooks/runs/playbook-1/artifacts/presentation/deck.html'),
      true,
    );
  });

  it('detects deck viewport shell in content', () => {
    assert.equal(isPresentationHtmlArtifact('preview.html', '<div id="deck-viewport"></div>'), true);
  });

  it('marks html decks as fullscreen capable', () => {
    assert.equal(
      isFullscreenCapableArtifact('deck.html', 'text/html', '<div id="deck-viewport"></div>'),
      true,
    );
    assert.equal(isFullscreenCapableArtifact('sample.pdf', 'application/pdf'), true);
  });
});
