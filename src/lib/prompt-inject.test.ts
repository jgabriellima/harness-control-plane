import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { stripPromptInjectTags, wrapPromptInject } from './prompt-inject.ts';

describe('prompt-inject', () => {
  it('wraps and strips rich-ui injection blocks', () => {
    const wrapped = wrapPromptInject('rich_ui', 'Emit openui-lang when helpful.', {
      mode: 'adaptive',
    });
    const raw = `${wrapped}\n\nShow 2 workspace metrics.`;

    const stripped = stripPromptInjectTags(raw);
    assert.equal(stripped.text, 'Show 2 workspace metrics.');
    assert.equal(stripped.tags.length, 1);
    assert.equal(stripped.tags[0]?.tag, 'rich-ui');
    assert.equal(stripped.tags[0]?.attrs.mode, 'adaptive');
  });

  it('wraps and strips continue injection blocks', () => {
    const wrapped = wrapPromptInject('continue', 'Continue from where you left off.');
    const stripped = stripPromptInjectTags(wrapped);
    assert.equal(stripped.text, '');
    assert.equal(stripped.tags.length, 1);
    assert.equal(stripped.tags[0]?.tag, 'continue');
    assert.equal(stripped.tags[0]?.content, 'Continue from where you left off.');
  });

  it('collects multiple injection tags in dispatch order', () => {
    const raw = [
      wrapPromptInject('computer_use', 'session_enabled target=host'),
      wrapPromptInject('rich_ui', 'Rich UI contract', { mode: 'always' }),
      'Summarize workspace health.',
    ].join('\n\n');

    assert.equal(stripPromptInjectTags(raw).text, 'Summarize workspace health.');
  });

  it('ignores legacy jambu-presentation markers that resemble xml tags', () => {
    const raw = [
      '<<jambu-presentation>>',
      '[presentation: adaptive]',
      'Rich UI is available for this workspace.',
      '<</jambu-presentation>>',
      '',
      'Summarize workspace health.',
    ].join('\n');

    const stripped = stripPromptInjectTags(raw);
    assert.equal(stripped.tags.length, 0);
    assert.match(stripped.text, /<<jambu-presentation>>/);
    assert.match(stripped.text, /Summarize workspace health/);
  });
});
