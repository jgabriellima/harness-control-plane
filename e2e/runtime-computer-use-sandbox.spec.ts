/**
 * Sandbox agent contract smoke (ADR-049 / BUSIN-60).
 *
 * Full Docker+VNC path is manual/CI-gated. This spec asserts the BFF contract
 * surfaces exist: status endpoint shape + prompt recipe unit coverage is in
 * runtime-computer-use-sandbox-contract.test.ts.
 */
import { test, expect } from '@playwright/test';

test.describe('runtime computer-use sandbox contract', () => {
  test('GET /api/runtime/computer-use/sandbox/status returns JSON contract', async ({
    request,
  }) => {
    const res = await request.get('/api/runtime/computer-use/sandbox/status');
    // 200 with body, or 500 if workspace binding missing in CI — still JSON
    const body = await res.json();
    expect(body).toBeTruthy();
    if (res.ok()) {
      expect(body).toHaveProperty('ready');
      expect(body).toHaveProperty('manifest');
      expect(body).toHaveProperty('contract_enabled');
    } else {
      expect(body).toHaveProperty('error');
    }
  });

  test('POST /api/runtime/computer-use/sandbox/action rejects when sandbox not ready', async ({
    request,
  }) => {
    const res = await request.post('/api/runtime/computer-use/sandbox/action', {
      data: { action: 'open_url', url: 'https://www.google.com' },
    });
    // 403 contract off, 409 not ready, or 500 workspace — never 200 without ready manifest
    expect(res.status()).not.toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });
});
