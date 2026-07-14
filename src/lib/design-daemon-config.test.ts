import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { designDaemonApiUrl, resolveDesignDaemonConfig } from './design-daemon-config.ts';
import { resolveDesignStudioEnabled } from './design-studio-config.ts';
import type { UIConfig } from './ui-config.ts';

describe('design-daemon-config', () => {
  it('builds default daemon base URL', () => {
    const config = resolveDesignDaemonConfig();
    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.port, 7456);
    assert.equal(config.baseUrl, 'http://127.0.0.1:7456');
    assert.equal(designDaemonApiUrl('/api/health', config), 'http://127.0.0.1:7456/api/health');
  });
});

describe('design-studio-config', () => {
  it('enables design studio only when feature flag is true', () => {
    const enabled: UIConfig = {
      apiVersion: 'proc.jambu/v1',
      kind: 'ControlPlaneUI',
      features: { design_studio: true },
    };
    const disabled: UIConfig = {
      apiVersion: 'proc.jambu/v1',
      kind: 'ControlPlaneUI',
      features: { design_studio: false },
    };
    assert.equal(resolveDesignStudioEnabled(enabled), true);
    assert.equal(resolveDesignStudioEnabled(disabled), false);
  });
});
