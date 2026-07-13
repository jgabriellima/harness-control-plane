import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeMarkdownForGfm, textLooksLikeMarkdown } from './markdown-gfm.ts';

describe('normalizeMarkdownForGfm', () => {
  it('inserts blank line before glued GFM tables', () => {
    const input = 'Summary line\n| Col | Val |\n| --- | --- |';
    const output = normalizeMarkdownForGfm(input);
    assert.match(output, /Summary line\n\n\| Col \| Val \|/);
  });

  it('inserts blank line before glued headings', () => {
    const input = 'Intro line\n### Section';
    const output = normalizeMarkdownForGfm(input);
    assert.match(output, /Intro line\n\n### Section/);
  });
});

describe('textLooksLikeMarkdown', () => {
  it('detects markdown tables and headings', () => {
    assert.equal(textLooksLikeMarkdown('| A | B |\n| - | - |'), true);
    assert.equal(textLooksLikeMarkdown('### Heading'), true);
  });

  it('returns false for plain sentences', () => {
    assert.equal(textLooksLikeMarkdown('Plain sentence only.'), false);
  });
});
