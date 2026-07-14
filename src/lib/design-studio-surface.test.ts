import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DECK_STUDIO_HEIGHT,
  DECK_STUDIO_WIDTH,
  encodeDesignProjectPath,
  inferDesignStudioSurface,
  projectRawFileUrl,
  sourceLooksLikeDeck,
  studioSurfaceUsesDeckBridge,
} from './design-studio-surface.ts';

describe('sourceLooksLikeDeck', () => {
  it('detects deck-stage markup', () => {
    assert.equal(sourceLooksLikeDeck('<deck-stage><section class="slide"></section></deck-stage>'), true);
  });

  it('rejects generic slide carousels without deck structure', () => {
    assert.equal(sourceLooksLikeDeck('<div class="slide testimonial"></div>'), false);
  });
});

describe('inferDesignStudioSurface', () => {
  it('maps image projects to image studio', () => {
    assert.equal(
      inferDesignStudioSurface('image', { path: 'output.png', kind: 'image' }),
      'image',
    );
  });

  it('maps binary video files to video studio', () => {
    assert.equal(
      inferDesignStudioSurface('video', { path: 'clip.mp4', kind: 'video' }),
      'video',
    );
  });

  it('maps video-kind HTML artifacts to HyperFrames', () => {
    assert.equal(
      inferDesignStudioSurface('video', { path: 'hyperframes.html', kind: 'html' }),
      'hyperframes',
    );
  });

  it('maps deck metadata to deck studio', () => {
    assert.equal(
      inferDesignStudioSurface('deck', { path: 'index.html', kind: 'html' }),
      'deck',
    );
  });

  it('detects deck HTML from source heuristics', () => {
    const html = '<div class="deck"><section class="slide" data-title="Intro"></section></div>';
    assert.equal(
      inferDesignStudioSurface('prototype', { path: 'pitch.html', kind: 'html' }, html),
      'deck',
    );
  });
});

describe('studioSurfaceUsesDeckBridge', () => {
  it('enables bridge for deck and hyperframes', () => {
    assert.equal(studioSurfaceUsesDeckBridge('deck'), true);
    assert.equal(studioSurfaceUsesDeckBridge('hyperframes'), true);
    assert.equal(studioSurfaceUsesDeckBridge('image'), false);
  });
});

describe('projectRawFileUrl', () => {
  it('encodes nested project file paths', () => {
    assert.equal(
      projectRawFileUrl('proj-1', 'assets/slide 1.html'),
      '/api/design/projects/proj-1/raw/assets/slide%201.html',
    );
    assert.equal(encodeDesignProjectPath('a/b/c.png'), 'a/b/c.png');
  });
});

describe('deck studio canvas constants', () => {
  it('uses 1920x1080 16:9 canvas', () => {
    assert.equal(DECK_STUDIO_WIDTH, 1920);
    assert.equal(DECK_STUDIO_HEIGHT, 1080);
  });
});
