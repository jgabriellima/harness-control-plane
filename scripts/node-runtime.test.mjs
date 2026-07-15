import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  PINNED_NODE_VERSION,
  discoverProjectRootFromCwd,
  resolveNodeDistPlatform,
  resolveNodeRuntimeRoot,
  resolveVendoredNodeBinary,
} from './node-runtime.mjs';

describe('node-runtime', () => {
  it('pins a Node 22.x release with node:sqlite support', () => {
    assert.match(PINNED_NODE_VERSION, /^22\./);
  });

  it('resolves runtime root under project .business when CONTROL_PLANE_PROJECT_ROOT is set', () => {
    const previous = process.env.CONTROL_PLANE_PROJECT_ROOT;
    process.env.CONTROL_PLANE_PROJECT_ROOT = '/tmp/demo-app';
    try {
      assert.equal(
        resolveNodeRuntimeRoot('/tmp/harness'),
        path.join('/tmp/demo-app', '.business', 'runtime', 'node'),
      );
    } finally {
      if (previous === undefined) {
        delete process.env.CONTROL_PLANE_PROJECT_ROOT;
      } else {
        process.env.CONTROL_PLANE_PROJECT_ROOT = previous;
      }
    }
  });

  it('discovers integrator project root from cwd', () => {
    const harnessRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
    const discovered = discoverProjectRootFromCwd(harnessRoot);
    assert.equal(discovered, null);
  });

  it('resolves vendored binary under current/ symlink', () => {
    const runtimeRoot = '/tmp/runtime/node';
    const binary = resolveVendoredNodeBinary(runtimeRoot);
    assert.match(binary, /current[/\\]bin[/\\]node(\.exe)?$/);
  });

  it('maps host platform to Node dist platform', () => {
    const dist = resolveNodeDistPlatform();
    assert.match(dist, /^(darwin-arm64|darwin-x64|linux-arm64|linux-x64|win-x64)$/);
  });
});
