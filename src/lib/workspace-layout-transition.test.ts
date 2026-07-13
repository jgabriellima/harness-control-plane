import { describe, expect, it } from 'vitest';

import { DRAFT_CONVERSATION_ID } from './draft-conversation';
import { buildPanesForLayoutTransition } from './workspace-layout-transition';

describe('buildPanesForLayoutTransition', () => {
  it('seeds pane 0 from home draft when expanding single to split', () => {
    const panes = buildPanesForLayoutTransition('split-2', 'single', [], '/', null);

    expect(panes).toEqual([DRAFT_CONVERSATION_ID, '']);
  });

  it('keeps the open conversation in pane 0 when expanding from single', () => {
    const panes = buildPanesForLayoutTransition(
      'split-2',
      'single',
      [],
      '/conversation/conv-abc',
      null,
    );

    expect(panes).toEqual(['conv-abc', '']);
  });

  it('preserves occupied panes when switching split to grid', () => {
    const panes = buildPanesForLayoutTransition(
      'grid-4',
      'split-2',
      ['conv-left', 'conv-right'],
      '/conversation/conv-left',
      'conv-left',
    );

    expect(panes).toEqual(['conv-left', 'conv-right', '', '']);
  });

  it('clears pane ids when collapsing to single', () => {
    const panes = buildPanesForLayoutTransition(
      'single',
      'split-2',
      ['conv-left', 'conv-right'],
      '/conversation/conv-left',
      'conv-left',
    );

    expect(panes).toEqual([]);
  });
});
