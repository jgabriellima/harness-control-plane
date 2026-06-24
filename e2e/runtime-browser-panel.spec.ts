import { expect, test } from '@playwright/test';

const TEST_URL = 'https://example.com';

test.describe('Runtime browser panel', () => {
  test('POST session creates Playwright session with sessionId and CDP endpoint', async ({ request }) => {
    const response = await request.post('/api/runtime/browser/session', {
      data: {
        url: TEST_URL,
        conversation_id: 'e2e-browser-panel',
      },
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      session: {
        sessionId: string;
        url: string;
        cdpEndpoint: string;
        renderMode: string;
        status: string;
      };
    };

    expect(body.session.sessionId).toMatch(/^browser-/);
    expect(body.session.url).toContain('example.com');
    expect(body.session.cdpEndpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(body.session.renderMode).toBe('screencast');
    expect(body.session.status).toBe('ready');

    const getResponse = await request.get(
      `/api/runtime/browser/session?session_id=${encodeURIComponent(body.session.sessionId)}`,
    );
    expect(getResponse.status()).toBe(200);

    await request.delete(
      `/api/runtime/browser/session?session_id=${encodeURIComponent(body.session.sessionId)}`,
    );
  });

  test('CDP manifest reflects active session after POST', async ({ request }) => {
    const create = await request.post('/api/runtime/browser/session', {
      data: {
        url: TEST_URL,
        conversation_id: 'e2e-browser-cdp',
      },
    });
    expect(create.status()).toBe(200);
    const { session } = (await create.json()) as { session: { sessionId: string; cdpEndpoint: string } };

    const cdp = await request.get('/api/runtime/browser/cdp');
    expect(cdp.status()).toBe(200);
    const manifest = (await cdp.json()) as {
      active: { sessionId: string; cdpEndpoint: string } | null;
    };
    expect(manifest.active?.sessionId).toBe(session.sessionId);
    expect(manifest.active?.cdpEndpoint).toBe(session.cdpEndpoint);

    await request.delete(
      `/api/runtime/browser/session?session_id=${encodeURIComponent(session.sessionId)}`,
    );
  });

  test('browser-open query param opens split shell with panel chrome', async ({ page }) => {
    await page.goto(`/?browser-open=${encodeURIComponent(TEST_URL)}&layout=single`);

    const shell = page.getByTestId('runtime-browser-shell');
    await expect(shell).toBeVisible({ timeout: 30_000 });
    await expect(shell).toHaveAttribute('class', /grid-cols-/);

    const panel = page.getByTestId('runtime-browser-panel');
    await expect(panel).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('runtime-browser-url')).toContainText('example.com');

    await page.getByTestId('runtime-browser-close').click();
    await expect(panel).toHaveCount(0);
  });
});
