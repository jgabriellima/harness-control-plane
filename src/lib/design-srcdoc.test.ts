import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { injectDesignDeckBridge } from './design-deck-bridge.ts';
import { buildDesignSrcdoc } from './design-srcdoc.ts';

describe('buildDesignSrcdoc deck mode', () => {
  it('injects deck bridge script when deck option is set', () => {
    const srcdoc = buildDesignSrcdoc('<section class="slide">One</section>', { deck: true });
    assert.match(srcdoc, /data-od-deck-bridge/);
    assert.match(srcdoc, /od:slide-state/);
  });

  it('does not inject deck bridge for prototype previews', () => {
    const srcdoc = buildDesignSrcdoc('<div>Hello</div>');
    assert.doesNotMatch(srcdoc, /data-od-deck-bridge/);
  });
});

describe('injectDesignDeckBridge', () => {
  it('adds stage centering fix for non-framework decks', () => {
    const doc = injectDesignDeckBridge('<html><head></head><body></body></html>');
    assert.match(doc, /data-od-deck-fix/);
    assert.match(doc, /place-content: center/);
  });

  it('skips stage centering fix for framework deck-stage artifacts', () => {
    const doc = injectDesignDeckBridge('<html><body><div id="deck-stage"></div></body></html>');
    assert.doesNotMatch(doc, /data-od-deck-fix/);
    assert.match(doc, /data-od-deck-bridge/);
  });
});
