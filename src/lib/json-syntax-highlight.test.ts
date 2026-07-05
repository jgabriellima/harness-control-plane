import assert from 'node:assert/strict';
import test from 'node:test';

import {
  highlightJsonText,
  isJsonInspectableText,
  resetJsonSyntaxHighlightCacheForTests,
} from './json-syntax-highlight.ts';

test('isJsonInspectableText detects object and array documents', () => {
  assert.equal(isJsonInspectableText('{"a":1}'), true);
  assert.equal(isJsonInspectableText('[1, 2]'), true);
  assert.equal(isJsonInspectableText('npm test'), false);
  assert.equal(isJsonInspectableText(''), false);
});

test('highlightJsonText returns null for non-json payloads', async () => {
  assert.equal(await highlightJsonText('npm test'), null);
});

test('highlightJsonText returns shiki html for formatted json', async () => {
  resetJsonSyntaxHighlightCacheForTests();
  const html = await highlightJsonText('{\n  "path": "/tmp/a.md"\n}');
  assert.ok(html);
  assert.match(html!, /class="shiki github-light"/);
  assert.match(html!, /"path"/);
});

test('highlightJsonText skips oversized payloads', async () => {
  const oversized = `{${'"a":'.repeat(30_000)}}`;
  assert.equal(await highlightJsonText(oversized), null);
});
