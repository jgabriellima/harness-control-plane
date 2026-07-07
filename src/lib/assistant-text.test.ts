import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { joinAssistantTextBlocks, mergeStreamingAssistantText } from './assistant-text.ts';

describe('joinAssistantTextBlocks', () => {
  it('joins multiple blocks with newlines preserving GFM structure', () => {
    const blocks = [
      'ajuste',
      'Outcome',
      '---',
      '## Briefing',
      '| Col A | Col B |',
      '|-------|-------|',
      '| 1 | 2 |',
    ];

    const joined = joinAssistantTextBlocks(blocks);

    assert.equal(joined.includes('ajuste\nOutcome'), true);
    assert.equal(joined.includes('---\n## Briefing'), true);
    assert.equal(joined.includes('| Col A | Col B |\n|-------|-------|'), true);
  });

  it('preserves trailing spaces inside blocks for word boundaries', () => {
    assert.equal(joinAssistantTextBlocks(['template ', 'corporativo']), 'template \ncorporativo');
    assert.equal(joinAssistantTextBlocks(['a ', 'materialização']), 'a \nmaterialização');
  });

  it('drops only empty blocks without trimming content', () => {
    assert.equal(joinAssistantTextBlocks(['  hello  ', '', '   ', 'world']), '  hello  \n   \nworld');
  });

  it('returns empty string for no content', () => {
    assert.equal(joinAssistantTextBlocks([]), '');
    assert.equal(joinAssistantTextBlocks(['', '  ']), '  ');
  });
});

describe('mergeStreamingAssistantText', () => {
  it('replaces with cumulative snapshots', () => {
    assert.equal(
      mergeStreamingAssistantText('template', 'template corporativo'),
      'template corporativo',
    );
  });

  it('concatenates token deltas without inferring mid-word spaces', () => {
    assert.equal(mergeStreamingAssistantText('Ret', 'om'), 'Retom');
    assert.equal(mergeStreamingAssistantText('Retom', 'ando'), 'Retomando');
    assert.equal(mergeStreamingAssistantText('ver', 'ific'), 'verific');
    assert.equal(mergeStreamingAssistantText('aplica', 'ções'), 'aplicações');
  });

  it('preserves explicit whitespace in SDK deltas', () => {
    assert.equal(mergeStreamingAssistantText('template', ' corporativo'), 'template corporativo');
    assert.equal(mergeStreamingAssistantText('Retomando:', ' vou'), 'Retomando: vou');
    assert.equal(mergeStreamingAssistantText('estado', ' CUA'), 'estado CUA');
  });

  it('merges overlapping token boundaries', () => {
    assert.equal(mergeStreamingAssistantText('hello wor', 'orld'), 'hello world');
  });

  it('ignores duplicate trailing chunks', () => {
    assert.equal(mergeStreamingAssistantText('hello world', 'world'), 'hello world');
  });
});
