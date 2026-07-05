import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatInspectable,
  normalizeInspectablePayload,
  tryParseJson,
} from './format-inspect.ts';

test('tryParseJson returns undefined for empty input', () => {
  assert.equal(tryParseJson(''), undefined);
  assert.equal(tryParseJson('   '), undefined);
});

test('normalizeInspectablePayload unwraps compact JSON strings', () => {
  const compact = JSON.stringify({
    contents: '# Title\n\nBody',
    path: '/tmp/example.md',
  });

  const normalized = normalizeInspectablePayload(compact);
  assert.deepEqual(normalized, {
    contents: '# Title\n\nBody',
    path: '/tmp/example.md',
  });
});

test('normalizeInspectablePayload unwraps nested JSON strings', () => {
  const inner = JSON.stringify({ command: 'npm test' });
  const outer = JSON.stringify(inner);

  assert.deepEqual(normalizeInspectablePayload(outer), { command: 'npm test' });
});

test('formatInspectable pretty-prints objects and unwrapped JSON strings', () => {
  const compact = JSON.stringify({ contents: 'line one\nline two', path: '/tmp/a.md' });
  const formatted = formatInspectable(compact);

  assert.match(formatted, /^\{\n/);
  assert.match(formatted, /"contents": "line one\\nline two"/);
  assert.match(formatted, /"path": "\/tmp\/a.md"/);
});

test('formatInspectable preserves plain text strings', () => {
  assert.equal(formatInspectable('plain log line'), 'plain log line');
});
