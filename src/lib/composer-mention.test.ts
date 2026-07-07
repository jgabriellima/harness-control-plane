import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseActiveFileMention,
  rankFileMentionSuggestions,
  replaceActiveFileMention,
  type FileMentionSuggestion,
} from './composer-mention.ts';

describe('composer-mention', () => {
  it('parses the trailing @ query token', () => {
    assert.equal(parseActiveFileMention('please review @design-syste'), 'design-syste');
    assert.equal(parseActiveFileMention('/business:goal'), null);
    assert.equal(parseActiveFileMention('no mention here'), null);
  });

  it('replaces only the active trailing mention', () => {
    assert.equal(
      replaceActiveFileMention('please review @design-syste', 'design-system.json'),
      'please review @design-system.json ',
    );
  });

  it('ranks prefix matches ahead of substring matches', () => {
    const files: FileMentionSuggestion[] = [
      { path: '.outputs/workflows/deck.json', name: 'deck.json', source: 'output' },
      {
        path: '.business/playbooks/runs/playbook-1/artifacts/presentation/design-system.json',
        name: 'design-system.json',
        source: 'playbook-artifact',
      },
    ];

    const ranked = rankFileMentionSuggestions(files, 'design-syste');
    assert.equal(ranked[0]?.name, 'design-system.json');
  });
});
