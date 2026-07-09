import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  clientSdkMessageContext,
  resolveServerSdkMessageContext,
  sdkAuthFailedMessage,
  sdkHealthBannerTitle,
  sdkMissingApiKeyMessage,
} from './runtime-sdk-messages.ts';

describe('runtime-sdk-messages', () => {
  it('uses neutral copy for shippable desktop bundles', () => {
    const ctx = resolveServerSdkMessageContext({
      distributionSurface: 'desktop',
      presentationTitle: 'ACME Workflow',
      operatorContext: false,
    });

    assert.equal(sdkHealthBannerTitle(ctx), 'Assistente indisponível');
    assert.doesNotMatch(sdkMissingApiKeyMessage(ctx), /CURSOR|\.env|harness-control-plane/i);
    assert.match(sdkMissingApiKeyMessage(ctx), /Configurações/);
    assert.doesNotMatch(sdkAuthFailedMessage(ctx), /CURSOR|\.env/i);
  });

  it('keeps operator guidance in engineering contexts', () => {
    const ctx = resolveServerSdkMessageContext({
      distributionSurface: 'web',
      presentationTitle: 'Control Plane',
      operatorContext: true,
    });

    assert.equal(sdkHealthBannerTitle(ctx), 'Runtime Cursor indisponível');
    assert.match(sdkMissingApiKeyMessage(ctx), /Runtime API Key/);
    assert.match(sdkMissingApiKeyMessage(ctx), /app\/\.env|Settings/);
  });

  it('treats shipped Tauri sidecar as shippable even when NODE_ENV is unset', () => {
    const previous = process.env.TAURI_BUNDLE_IDENTIFIER;
    process.env.TAURI_BUNDLE_IDENTIFIER = 'com.acme.workflow';
    try {
      const ctx = resolveServerSdkMessageContext({
        distributionSurface: 'desktop',
        presentationTitle: 'ACME Workflow',
      });
      assert.equal(ctx.operatorContext, false);
      assert.equal(sdkHealthBannerTitle(ctx), 'Assistente indisponível');
    } finally {
      if (previous === undefined) {
        delete process.env.TAURI_BUNDLE_IDENTIFIER;
      } else {
        process.env.TAURI_BUNDLE_IDENTIFIER = previous;
      }
    }
  });

  it('client context can force shippable copy for production bundles', () => {
    const ctx = clientSdkMessageContext({
      surface: 'desktop',
      presentationTitle: 'ACME Workflow',
      operatorContext: false,
    });
    assert.equal(ctx.operatorContext, false);
    assert.doesNotMatch(sdkMissingApiKeyMessage(ctx), /CURSOR/i);
  });
});
