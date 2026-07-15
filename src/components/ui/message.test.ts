import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MessageContent } from './message.tsx';

describe('MessageContent markdown', () => {
  it('renders markdown for a single string child', () => {
    const html = renderToStaticMarkup(
      React.createElement(MessageContent, { markdown: true }, '## Heading'),
    );

    assert.match(html, /chat-markdown/);
    assert.match(html, /<h2[^>]*>Heading<\/h2>/);
  });

  it('renders markdown when string child is followed by null (streaming slot)', () => {
    const html = renderToStaticMarkup(
      React.createElement(MessageContent, { markdown: true }, '## Heading', null),
    );

    assert.match(html, /chat-markdown/);
    assert.match(html, /<h2[^>]*>Heading<\/h2>/);
  });

  it('falls back to plain wrapper when markdown child includes a React element', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MessageContent,
        { markdown: true },
        '## Heading',
        React.createElement('span', null, 'loading'),
      ),
    );

    assert.doesNotMatch(html, /chat-markdown/);
    assert.match(html, /## Heading/);
  });
});
