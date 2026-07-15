import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveThreadFileContent } from './thread-file-content.ts';

const HTML_DOC =
  '<!DOCTYPE html><html><head><title>Deck</title></head><body><div class="slide">One</div></body></html>';

describe('resolveThreadFileContent', () => {
  it('extracts html fenced content referenced by uploads path', () => {
    const match = resolveThreadFileContent(
      [
        {
          role: 'assistant',
          content: [
            'Save this as `.uploads/AI_Team_Assessment_Board_Presentation.html`:',
            '',
            '```html',
            HTML_DOC,
            '```',
          ].join('\n'),
        },
      ],
      '.uploads/AI_Team_Assessment_Board_Presentation.html',
    );

    assert.ok(match);
    assert.equal(match.mime, 'text/html');
    assert.equal(match.content, HTML_DOC);
  });

  it('matches bare filename references against uploads path', () => {
    const match = resolveThreadFileContent(
      [
        {
          role: 'assistant',
          content: ['Updated `board-deck.html`:', '', '```html', HTML_DOC, '```'].join('\n'),
        },
      ],
      '.uploads/board-deck.html',
    );

    assert.ok(match);
    assert.equal(match.content, HTML_DOC);
  });

  it('extracts plain text blocks for txt artifacts', () => {
    const match = resolveThreadFileContent(
      [
        {
          role: 'assistant',
          content: ['Save as `.uploads/board-deck-test.txt`:', '', '```text', 'line one', '```'].join('\n'),
        },
      ],
      '.uploads/board-deck-test.txt',
    );

    assert.ok(match);
    assert.equal(match.mime, 'text/plain');
    assert.equal(match.content, 'line one');
  });

  it('prefers the most recent assistant message that references the path', () => {
    const match = resolveThreadFileContent(
      [
        {
          role: 'assistant',
          content: ['First draft `deck.html`:', '', '```html', '<html>old</html>', '```'].join('\n'),
        },
        {
          role: 'assistant',
          content: ['Final `deck.html`:', '', '```html', HTML_DOC, '```'].join('\n'),
        },
      ],
      'deck.html',
    );

    assert.ok(match);
    assert.equal(match.content, HTML_DOC);
  });

  it('returns null when the path is referenced without fenced content', () => {
    const match = resolveThreadFileContent(
      [{ role: 'assistant', content: 'Created `.uploads/missing.html` for you.' }],
      '.uploads/missing.html',
    );

    assert.equal(match, null);
  });
});
