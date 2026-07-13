import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { splitOpenUIEnvelope, stripPresentationArtifacts } from './openui-envelope.ts';

describe('splitOpenUIEnvelope', () => {
  it('returns prose when no fence is present', () => {
    const split = splitOpenUIEnvelope('Plain answer only.');
    assert.equal(split.text, 'Plain answer only.');
    assert.equal(split.openuiSource, '');
    assert.equal(split.openFence, false);
  });

  it('extracts fenced openui-lang block and surrounding prose', () => {
    const raw = [
      'Summary below.',
      '',
      '```openui-lang',
      'root = Stack([title], "column", "m")',
      'title = Heading("Hello", "2")',
      '```',
    ].join('\n');

    const split = splitOpenUIEnvelope(raw);
    assert.equal(split.text, 'Summary below.');
    assert.match(split.openuiSource, /root = Stack/);
    assert.equal(split.openFence, false);
  });

  it('prefers the substantive dashboard fence over echoed prompt examples', () => {
    const raw = [
      '[presentation: adaptive]',
      'Example:',
      '```openui-lang',
      'root = Stack([heading, metrics], "column", "m")',
      'heading = Heading("Activity", "2")',
      '```',
      '',
      'Workspace overview with placeholder metrics.',
      '',
      '```openui-lang',
      'root = Stack([heading, metrics, chart, ranks], "column", "m")',
      'heading = Heading("Workspace activity", "2")',
      'metrics = Stack([m1, m2], "row", "s")',
      'm1 = Metric("Active runs", "3", "up")',
      'm2 = Metric("Failed checks", "1", "flat")',
      'chart = BarChart(["Mon", "Tue", "Wed"], [4, 6, 3], "Runs by day")',
      'ranks = RankedList([{rank: 1, title: "chat.fanout", value: "12"}])',
      '```',
    ].join('\n');

    const split = splitOpenUIEnvelope(raw);
    assert.match(split.text, /Workspace overview/);
    assert.match(split.openuiSource, /Metric\("Active runs"/);
    assert.match(split.openuiSource, /BarChart/);
    assert.doesNotMatch(split.text, /\[presentation: adaptive\]/);
  });

  it('extracts openui source from generic code fences when body looks like openui-lang', () => {
    const raw = [
      'Workspace overview.',
      '',
      '```',
      'root = Stack([heading], "column", "m")',
      'heading = Heading("Workspace activity", "2")',
      '```',
    ].join('\n');

    const split = splitOpenUIEnvelope(raw);
    assert.equal(split.text, 'Workspace overview.');
    assert.match(split.openuiSource, /root = Stack/);
  });

  it('does not steal markdown tables from generic code fences', () => {
    const raw = [
      'Role assignments',
      '',
      '```',
      '| Role | Owner |',
      '|------|-------|',
      '| AI Lead | Patrícia |',
      '```',
    ].join('\n');

    const split = splitOpenUIEnvelope(raw);
    assert.equal(split.openuiSource, '');
    assert.match(split.text, /\| Role \| Owner \|/);
  });

  it('does not steal mermaid diagrams from fenced blocks', () => {
    const raw = [
      'Org chart',
      '',
      '```mermaid',
      'flowchart TB',
      '  A --> B',
      '```',
    ].join('\n');

    const split = splitOpenUIEnvelope(raw);
    assert.equal(split.openuiSource, '');
    assert.match(split.text, /```mermaid/);
  });

  it('marks partial fences as streaming', () => {
    const raw = 'Intro\n\n```openui-lang\nroot = Stack([';
    const split = splitOpenUIEnvelope(raw);
    assert.equal(split.text, 'Intro');
    assert.equal(split.openFence, true);
    assert.match(split.openuiSource, /root = Stack/);
  });

  it('strips echoed presentation guidance before splitting', () => {
    const sanitized = stripPresentationArtifacts(
      [
        'Do NOT use OpenUI for: short answers.',
        'Important Rules: wrap openui-lang in fences.',
        '',
        'Workspace overview.',
        '',
        '```openui-lang',
        'root = Stack([m1], "column", "m")',
        'm1 = Metric("Active runs", "3", "up")',
        '```',
      ].join('\n'),
    );

    assert.match(sanitized, /Workspace overview/);
    assert.doesNotMatch(sanitized, /Important Rules/);
  });
});
