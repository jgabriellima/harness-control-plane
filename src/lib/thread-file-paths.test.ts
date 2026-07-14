import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { collectThreadFileActivity, collectThreadFilePaths } from './thread-file-paths.ts';

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

  it('orders paths from most recently referenced to oldest', () => {
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

    assert.deepEqual(paths, [
      'artifacts/deck.html',
      'artifacts/presentation-production.pb.yaml',
      'artifacts/page.pdf',
    ]);
  });

  it('excludes cursor internal paths and attaches mutation actions', () => {
    const items = collectThreadFileActivity([
      {
        role: 'tool',
        content: 'Write · completed',
        toolInput: JSON.stringify({
          path: '.cursor/projects/Users/dev/agent/917feb1e.txt',
        }),
      },
      {
        role: 'tool',
        content: 'Write · completed',
        toolInput: JSON.stringify({ path: 'delivery.md' }),
      },
      {
        role: 'tool',
        content: 'edit · completed',
        toolInput: JSON.stringify({ file_path: 'report.md' }),
      },
    ]);

    assert.deepEqual(
      items.map((item) => item.path),
      ['report.md', 'delivery.md'],
    );
    assert.equal(items.find((item) => item.path === 'delivery.md')?.action, 'create');
    assert.equal(items.find((item) => item.path === 'report.md')?.action, 'edit');
  });
});
