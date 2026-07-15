import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveComposerToolActivityEnabled } from './composer-tool-activity-config.ts';
import type { UIConfig } from './ui-config.ts';

const baseConfig: UIConfig = {
  apiVersion: 'proc.jambu/v1',
  kind: 'ControlPlaneUI',
};

describe('resolveComposerToolActivityEnabled', () => {
  it('defaults to enabled when feature is absent', () => {
    assert.equal(resolveComposerToolActivityEnabled(baseConfig), true);
  });

  it('defaults to enabled when feature is true', () => {
    assert.equal(
      resolveComposerToolActivityEnabled({
        ...baseConfig,
        features: { composer_tool_activity: true },
      }),
      true,
    );
  });

  it('disables when feature is false', () => {
    assert.equal(
      resolveComposerToolActivityEnabled({
        ...baseConfig,
        features: { composer_tool_activity: false },
      }),
      false,
    );
  });
});
