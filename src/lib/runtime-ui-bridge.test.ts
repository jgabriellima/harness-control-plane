import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildUiControlManifest, resolvePreviewTarget } from './runtime-ui-bridge.ts';

describe('runtime-ui-bridge', () => {
  it('routes http(s) URLs to browser preview', () => {
    assert.equal(resolvePreviewTarget('https://example.com/page'), 'browser');
    assert.equal(resolvePreviewTarget('http://127.0.0.1:8080'), 'browser');
  });

  it('routes workspace paths to artifact preview', () => {
    assert.equal(resolvePreviewTarget('.business/samples/report.csv'), 'artifact');
    assert.equal(resolvePreviewTarget('/workspaces/default/.business/foo.docx'), 'artifact');
  });

  it('exposes browserPanel in UI manifest', () => {
    const manifest = buildUiControlManifest('http://127.0.0.1:4321') as {
      surfaces?: { browserPanel?: { open?: unknown }; toolActivityPanel?: { open?: unknown } };
    };
    assert.ok(manifest.surfaces?.browserPanel?.open);
    assert.ok(manifest.surfaces?.toolActivityPanel?.open);
  });
});
