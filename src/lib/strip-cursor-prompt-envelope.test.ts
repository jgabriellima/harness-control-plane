import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { stripCursorPromptEnvelope } from './strip-cursor-prompt-envelope';

describe('stripCursorPromptEnvelope', () => {
  it('extracts body from user_query envelope', () => {
    const input =
      '<timestamp>Monday, Jul 6, 2026, 7:54 PM (UTC-3)</timestamp>\n<user_query>\n/business:workflow:presentation-keynote-production\n\nDeep research sobre RAG\n</user_query>';
    assert.equal(
      stripCursorPromptEnvelope(input),
      '/business:workflow:presentation-keynote-production\n\nDeep research sobre RAG',
    );
  });

  it('returns plain text unchanged', () => {
    assert.equal(stripCursorPromptEnvelope('/business:playbook invoke'), '/business:playbook invoke');
  });

  it('strips timestamp when user_query is absent', () => {
    const input = '<timestamp>Sunday, Jul 5, 2026, 1:56 PM (UTC-3)</timestamp>\nHello runtime';
    assert.equal(stripCursorPromptEnvelope(input), 'Hello runtime');
  });

  it('handles open user_query without closing tag', () => {
    const input = '<timestamp>Mon</timestamp>\n<user_query>\nPartial prompt';
    assert.equal(stripCursorPromptEnvelope(input), 'Partial prompt');
  });

  it('returns empty string for empty input', () => {
    assert.equal(stripCursorPromptEnvelope(''), '');
    assert.equal(stripCursorPromptEnvelope('   '), '');
  });
});
