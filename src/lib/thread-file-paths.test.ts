import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { collectThreadFilePaths } from './thread-file-paths.ts';

describe('collectThreadFilePaths', () => {
  it('aggregates files across multiple turns in a thread', () => {
    const paths = collectThreadFilePaths([
      { role: 'user', content: 'Create deck' },
      {
        role: 'assistant',
        content: 'Created `artifacts/presentation-production.pb.yaml` and `artifacts/page.pdf`.',
      },
      { role: 'user', content: 'Update the deck' },
      {
        role: 'tool',
        content: 'write · completed',
        toolInput: JSON.stringify({ path: 'artifacts/deck.html' }),
      },
      { role: 'assistant', content: 'Updated `artifacts/deck.html`.' },
    ]);

    assert.ok(paths.includes('artifacts/presentation-production.pb.yaml'));
    assert.ok(paths.includes('artifacts/page.pdf'));
    assert.ok(paths.includes('artifacts/deck.html'));
    assert.equal(paths.length, 3);
  });

  it('returns empty array when no file paths are present', () => {
    assert.deepEqual(collectThreadFilePaths([{ role: 'assistant', content: 'Hello world.' }]), []);
  });
});
