import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { looksLikeHtmlDocument } from './html-document.ts';

describe('looksLikeHtmlDocument', () => {
  it('detects doctype HTML documents', () => {
    const source = '<!DOCTYPE html><html><head></head><body><p>Hello</p></body></html>';
    assert.equal(looksLikeHtmlDocument(source), true);
  });

  it('detects html root without doctype', () => {
    const source = '<html lang="en"><body><div class="slide">One</div></body></html>';
    assert.equal(looksLikeHtmlDocument(source), true);
  });

  it('rejects short snippets', () => {
    assert.equal(looksLikeHtmlDocument('<div>hi</div>'), false);
  });

  it('rejects non-document fragments', () => {
    const source = '```html\n<style>.slide { color: red; }</style>\n```';
    assert.equal(looksLikeHtmlDocument(source), false);
  });
});
